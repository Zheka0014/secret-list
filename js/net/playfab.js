// Online play with no server of our own (web / Microsoft Store version).
// PlayFab Lobby finds a room by its short code and carries the WebRTC
// handshake; after that all game traffic goes straight between the players'
// browsers over WebRTC data channels: "u" (unordered, no retransmits) for
// snapshots and inputs, "r" (reliable, ordered) for everything else.
import { Emitter } from './transport.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fail = (code, extra = {}) => Object.assign(new Error(code), { code, ...extra });

export function makeRoomCode(rand = Math.random) {
  let s = '';
  for (let i = 0; i < 5; i++) s += CODE_CHARS[Math.floor(rand() * CODE_CHARS.length)];
  return s;
}
export const normalizeCode = v => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);

// ---- compact SDP ---------------------------------------------------------------
// A data-channel-only session needs just the ICE credentials, the DTLS
// fingerprint, the DTLS role and the candidates; everything else is rebuilt.
// This keeps an offer or answer around 300–500 characters (PlayFab allows
// 1000 per value and 4096 per lobby/member).
export function packSdp(sdp) {
  const get = re => (sdp.match(re) || [])[1] || '';
  const ufrag = get(/a=ice-ufrag:(\S+)/), pwd = get(/a=ice-pwd:(\S+)/);
  const fp = get(/a=fingerprint:sha-256 ([0-9A-Fa-f:]+)/).replace(/:/g, '');
  const setup = get(/a=setup:(\S+)/);
  const cands = [];
  for (const m of sdp.matchAll(/a=candidate:([^\r\n]+)/g)) {
    const t = m[1].trim().split(/\s+/);
    if (t.length < 8 || t[2].toLowerCase() !== 'udp') continue;
    const keep = t.slice(0, 8);
    if (t[8] === 'raddr' && t.length >= 12) keep.push(...t.slice(8, 12));
    cands.push(keep.join(' '));
    if (cands.length >= 8) break;
  }
  if (!ufrag || !pwd || fp.length !== 64 || !setup) throw fail('sdp');
  return [ufrag, pwd, fp, setup, cands.join('~')].join('|');
}
export function unpackSdp(packed) {
  const [ufrag, pwd, fp, setup, cands = ''] = String(packed).split('|');
  if (!ufrag || !pwd || !fp || !setup) throw fail('sdp');
  const fingerprint = fp.toUpperCase().match(/../g).join(':');
  const lines = [
    'v=0', 'o=- 4611731400430051336 2 IN IP4 127.0.0.1', 's=-', 't=0 0', 'a=group:BUNDLE 0', 'a=msid-semantic: WMS',
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel', 'c=IN IP4 0.0.0.0',
    ...cands.split('~').filter(Boolean).map(c => 'a=candidate:' + c),
    'a=ice-ufrag:' + ufrag, 'a=ice-pwd:' + pwd, 'a=ice-options:trickle',
    'a=fingerprint:sha-256 ' + fingerprint, 'a=setup:' + setup, 'a=mid:0', 'a=sctp-port:5000', 'a=max-message-size:262144'
  ];
  return lines.join('\r\n') + '\r\n';
}
// PlayFab values are limited in size, so long strings go into numbered keys.
export function toChunks(prefix, value, size = 900) {
  const out = {};
  for (let i = 0, n = 0; i < value.length; i += size, n++) out[prefix + n] = value.slice(i, i + size);
  return out;
}
export function fromChunks(data, prefix) {
  if (!data || data[prefix + '0'] == null) return null;
  let s = '';
  for (let n = 0; data[prefix + n] != null; n++) s += data[prefix + n];
  return s;
}

// ---- PlayFab REST ----------------------------------------------------------------
export class PlayFabApi {
  constructor(titleId, { base = null, storage = globalThis.localStorage, fetchFn = globalThis.fetch?.bind(globalThis) } = {}) {
    this.titleId = titleId;
    this.base = base || `https://${String(titleId).toLowerCase()}.playfabapi.com`;
    this.storage = storage; this.fetch = fetchFn;
    this.entity = null; this.token = null; this.expires = 0;
  }
  async call(path, body, headers = {}) {
    let json;
    try {
      const res = await this.fetch(this.base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
      json = await res.json();
    } catch { throw fail('network'); }
    if (json && json.code === 200 && json.data) return json.data;
    throw fail(json?.error || 'playfab', { errorCode: json?.errorCode, retryAfter: json?.retryAfterSeconds, message: json?.errorMessage });
  }
  lobby(op, body) { return this.call('/Lobby/' + op, body, { 'X-EntityToken': this.token }); }
  // Anonymous account: a random id kept on this device, nothing personal.
  async login() {
    if (this.token && Date.now() < this.expires - 60000) return this;
    const key = 'secret-list.playfab.id';
    let id = null;
    try { id = this.storage?.getItem(key); } catch { /* storage may be off */ }
    if (!id) {
      id = globalThis.crypto?.randomUUID?.() || Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
      try { this.storage?.setItem(key, id); } catch { /* a new id next time, that is fine */ }
    }
    const d = await this.call('/Client/LoginWithCustomID', { TitleId: this.titleId, CustomId: id, CreateAccount: true });
    let et = d.EntityToken;
    if (!et?.EntityToken) et = await this.call('/Authentication/GetEntityToken', {}, { 'X-Authorization': d.SessionTicket });
    this.token = et.EntityToken;
    this.entity = { Id: et.Entity.Id, Type: et.Entity.Type };
    this.expires = Date.parse(et.TokenExpiration) || Date.now() + 3600e3;
    return this;
  }
}

// ---- WebRTC helpers --------------------------------------------------------------
function waitGathering(pc, ms = 2500) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise(resolve => {
    const t = setTimeout(done, ms);
    function done() { clearTimeout(t); pc.removeEventListener('icegatheringstatechange', check); resolve(); }
    function check() { if (pc.iceGatheringState === 'complete') done(); }
    pc.addEventListener('icegatheringstatechange', check);
  });
}

// ---- transport ---------------------------------------------------------------------
export class PlayFabTransport extends Emitter {
  constructor({ titleId, base = null, iceServers = [], name = '', maxPlayers = 8, api = null, RTC = globalThis.RTCPeerConnection, joinTimeout = 25000, pollMs = 1200, findAttempts = 4, findDelayMs = 900 } = {}) {
    super();
    if (!RTC) throw fail('webrtc');
    this.api = api || new PlayFabApi(titleId, { base });
    this.kind = 'playfab'; this.iceServers = iceServers; this.name = name; this.maxPlayers = maxPlayers;
    this.RTC = RTC; this.joinTimeout = joinTimeout; this.pollMs = pollMs; this.findAttempts = findAttempts; this.findDelayMs = findDelayMs;
    this.peers = new Set(); this.links = new Map(); this.closed = false; this.timers = [];
  }
  _pc() { return new this.RTC({ iceServers: this.iceServers }); }
  _channel(link, ch) {
    ch.binaryType = 'arraybuffer';
    link[ch.label === 'u' ? 'u' : 'r'] = ch;
    ch.onmessage = e => {
      if (this.closed) return;
      const bytes = e.data instanceof ArrayBuffer ? new Uint8Array(e.data) : typeof e.data === 'string' ? new TextEncoder().encode(e.data) : new Uint8Array(e.data);
      this.emit('message', { from: link.id, bytes });
    };
    if (ch.label === 'r') {
      ch.onopen = () => this._opened(link);
      ch.onclose = () => this._lost(link);
      if (ch.readyState === 'open') this._opened(link);
    }
  }
  _watch(link) {
    link.pc.onconnectionstatechange = () => { const s = link.pc.connectionState; if (s === 'failed' || s === 'closed') this._lost(link); };
  }

  // ---- host ----------------------------------------------------------------------
  async host() {
    const api = this.api;
    await api.login();
    this.role = 'host'; this.selfId = 'pf:' + api.entity.Id; this.hostId = this.selfId;
    await this._dropOldLobbies();
    for (let attempt = 0; attempt < 4; attempt++) {
      const code = makeRoomCode();
      const taken = await api.lobby('FindLobbies', { Filter: `string_key1 eq '${code}'`, Pagination: { PageSizeRequested: 1 } }).catch(() => null);
      if (taken?.Lobbies?.length) continue;
      const res = await api.lobby('CreateLobby', {
        MaxPlayers: this.maxPlayers, Owner: api.entity, AccessPolicy: 'Public', UseConnections: false, OwnerMigrationPolicy: 'None',
        RestrictInvitesToLobbyOwner: false, LobbyData: { v: '1', hb: String(Date.now()) }, SearchData: { string_key1: code },
        Members: [{ MemberEntity: api.entity, MemberData: {} }]
      });
      this.lobbyId = res.LobbyId; this.room = code;
      this._pollHost();
      return this;
    }
    throw fail('code');
  }
  async _dropOldLobbies() {
    // A crashed session can leave our old lobby behind; PlayFab limits how many
    // lobbies a player may own, so clean up first.
    // Players cannot delete lobbies (only title servers can); a lobby disappears
    // once its last member leaves, so leaving is enough.
    const api = this.api;
    const member = await api.lobby('FindLobbies', { Filter: "lobby/amMember eq 'true'", Pagination: { PageSizeRequested: 10 } }).catch(() => null);
    for (const l of member?.Lobbies || []) await api.lobby('LeaveLobby', { LobbyId: l.LobbyId, MemberEntity: api.entity }).catch(() => {});
  }
  _pollHost() {
    let lastBeat = Date.now();
    const loop = async () => {
      while (!this.closed) {
        try {
          const { Lobby } = await this.api.lobby('GetLobby', { LobbyId: this.lobbyId });
          for (const m of Lobby.Members || []) {
            const id = m.MemberEntity?.Id;
            if (!id || id === this.api.entity.Id) continue;
            const offer = fromChunks(m.MemberData, 'o'), old = this.links.get('pf:' + id);
            // A player who comes back (same device) brings a fresh offer.
            if (!offer || (old && (!old.gone || old.offer === offer))) continue;
            this._answer(id, offer).catch(e => console.warn('answer', e));
          }
          if (Date.now() - lastBeat > 30000) { lastBeat = Date.now(); await this.api.lobby('UpdateLobby', { LobbyId: this.lobbyId, LobbyData: { hb: String(lastBeat) } }); }
        } catch (e) {
          if (e.code === 'LobbyDoesNotExist') { if (!this.closed) { this.closed = true; this.emit('close', { reason: 'error' }); } return; }
          await sleep((e.retryAfter || 2) * 1000);
        }
        await sleep(this.peers.size ? this.pollMs * 2 : this.pollMs);
      }
    };
    loop();
  }
  async _answer(entityId, packedOffer) {
    const id = 'pf:' + entityId, key = 'a' + entityId + '_';
    const link = { id, entityId, pc: this._pc(), key, open: false, gone: false, offer: packedOffer };
    this.links.set(id, link);
    link.pc.ondatachannel = e => this._channel(link, e.channel);
    this._watch(link);
    await link.pc.setRemoteDescription({ type: 'offer', sdp: unpackSdp(packedOffer) });
    await link.pc.setLocalDescription(await link.pc.createAnswer());
    await waitGathering(link.pc);
    if (this.closed || link.gone) return;
    const answer = toChunks(key, packSdp(link.pc.localDescription.sdp));
    link.keys = Object.keys(answer);
    await this.api.lobby('UpdateLobby', { LobbyId: this.lobbyId, LobbyData: answer });
    // Give up on a player who never connects (and free the lobby space).
    link.timer = setTimeout(() => { if (!link.open) this._lost(link); }, this.joinTimeout);
  }
  _opened(link) {
    if (link.open || this.closed) return;
    link.open = true; clearTimeout(link.timer);
    if (this.role === 'host') {
      this.peers.add(link.id);
      this.emit('peer-join', { id: link.id });
      this._clearAnswer(link);
    }
  }
  _clearAnswer(link) {
    if (this.role !== 'host' || !link.keys?.length || !this.lobbyId) return;
    const keys = link.keys; link.keys = null;
    this.api.lobby('UpdateLobby', { LobbyId: this.lobbyId, LobbyDataToDelete: keys }).catch(() => {});
  }
  _lost(link) {
    if (link.gone) return;
    link.gone = true; clearTimeout(link.timer);
    try { link.pc.close(); } catch { /* already closed */ }
    if (this.role === 'host') {
      this._clearAnswer(link);
      // Keep the entry so the same (stale) lobby member is not answered again.
      if (this.peers.delete(link.id)) this.emit('peer-leave', { id: link.id });
    } else if (!this.closed) {
      this.closed = true;
      this.emit('close', { reason: 'hostLeft' });
    }
  }
  kick(id) { const l = this.links.get(id); if (l) this._lost(l); }

  // ---- client ----------------------------------------------------------------------
  async join(code) {
    const api = this.api;
    code = normalizeCode(code);
    if (!code) throw fail('noRoom');
    await api.login();
    this.role = 'client'; this.selfId = 'pf:' + api.entity.Id; this.room = code;
    // Lobby search is indexed with a short delay (about a second on PlayFab), so a
    // room created a moment ago may need another look.
    let found = { Lobbies: [] };
    for (let attempt = 0; attempt < this.findAttempts; attempt++) {
      if (attempt) await sleep(this.findDelayMs);
      found = await api.lobby('FindLobbies', { Filter: `string_key1 eq '${code}'`, Pagination: { PageSizeRequested: 5 } });
      if (found.Lobbies?.length) break;
    }
    const lobby = (found.Lobbies || []).find(l => l.MembershipLock !== 'Locked' && l.CurrentPlayers < l.MaxPlayers) || null;
    if (!lobby) throw fail((found.Lobbies || []).length ? 'full' : 'noRoom');
    this.hostId = 'pf:' + lobby.Owner.Id;
    const link = { id: this.hostId, pc: this._pc(), open: false, gone: false };
    this.links.set(link.id, link);
    this._channel(link, link.pc.createDataChannel('r', { ordered: true }));
    this._channel(link, link.pc.createDataChannel('u', { ordered: false, maxRetransmits: 0 }));
    this._watch(link);
    await link.pc.setLocalDescription(await link.pc.createOffer());
    await waitGathering(link.pc);
    const offer = toChunks('o', packSdp(link.pc.localDescription.sdp));
    const joined = await api.lobby('JoinLobby', { ConnectionString: lobby.ConnectionString, MemberEntity: api.entity, MemberData: offer })
      .catch(e => { throw fail(e.code === 'LobbyNotJoinable' ? 'full' : e.code === 'LobbyDoesNotExist' ? 'noRoom' : e.code); });
    this.lobbyId = joined.LobbyId;
    const key = 'a' + api.entity.Id + '_', deadline = Date.now() + this.joinTimeout;
    try {
      let answered = false;
      while (!this.closed && Date.now() < deadline && !link.open && !link.gone) {
        if (!answered) {
          const { Lobby } = await api.lobby('GetLobby', { LobbyId: this.lobbyId }).catch(e => { if (e.code === 'LobbyDoesNotExist') throw fail('noRoom'); return { Lobby: null }; });
          const answer = Lobby && fromChunks(Lobby.LobbyData, key);
          if (answer) { answered = true; await link.pc.setRemoteDescription({ type: 'answer', sdp: unpackSdp(answer) }); }
        }
        await sleep(answered ? 150 : this.pollMs);
      }
      if (!link.open) throw fail(this.closed ? 'closed' : 'timeout');
      return this;
    } catch (e) {
      link.gone = true; try { link.pc.close(); } catch { /* ignore */ }
      throw e;
    } finally {
      // We only needed the lobby to meet the host.
      api.lobby('LeaveLobby', { LobbyId: this.lobbyId, MemberEntity: api.entity }).catch(() => {});
    }
  }

  // ---- traffic ---------------------------------------------------------------------
  send(peer, bytes, reliable = true) {
    const link = this.links.get(peer);
    if (!link || !link.open || link.gone) return;
    let ch = reliable ? link.r : link.u;
    if (!ch || ch.readyState !== 'open') { if (!reliable) return; ch = link.r; }
    if (!ch || ch.readyState !== 'open') return;
    if (!reliable && ch.bufferedAmount > 256 * 1024) return;   // congested: drop a snapshot
    try { ch.send(bytes); } catch { /* channel closing */ }
  }
  broadcast(bytes, reliable = true) { for (const p of this.peers) this.send(p, bytes, reliable); }
  close() {
    if (this.closed) return;
    this.closed = true;
    for (const l of this.links.values()) { l.gone = true; clearTimeout(l.timer); try { l.pc.close(); } catch { /* ignore */ } }
    if (this.role === 'host' && this.lobbyId) this.api.lobby('LeaveLobby', { LobbyId: this.lobbyId, MemberEntity: this.api.entity }).catch(() => {});
  }
}
