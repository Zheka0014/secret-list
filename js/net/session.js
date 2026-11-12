// Match sessions. The host (also used for solo play, with no transport) runs
// the authoritative simulation; clients send inputs, predict their own hero,
// and draw everybody else from interpolated snapshots. DOM-free, so the whole
// multiplayer loop can be tested in Node.
import { DT, RULES as R, SNAPSHOT_EVERY, INPUT_SEND_EVERY, INPUT_REDUNDANCY, INTERP_TICKS, MAX_PLAYERS, HEROES, TRAPS, PROTOCOL_VERSION, GAME_VERSION, DEFAULT_DURATION, MATCH_DURATIONS } from '../config.js';
import { createMatch, stepMatch, drainEvents, setBot, integrate, outOfBounds, clampInside, sanitizeInput, BTN } from '../sim.js';
import { randomSeed } from '../rng.js';
import { MSG, encodeJson, decodeJson, typeOf, encodeSnapshot, decodeSnapshot, encodeInputs, decodeInputs } from './protocol.js';
import { Emitter } from './transport.js';

const PRIVATE = new Set(['target', 'trapNone', 'turned']);
const MAX_QUEUE = 30, PEER_TIMEOUT = 12, HOST_TIMEOUT = 12;
const quant = v => Math.round(Math.max(-1, Math.min(1, v)) * 127) / 127;

function freeHero(taken, preferred) {
  if (preferred >= 0 && preferred < HEROES.length && !taken.has(preferred)) return preferred;
  for (let i = 0; i < HEROES.length; i++) if (!taken.has(i)) return i;
  return 0;
}

// ============================================================================
export class HostSession extends Emitter {
  constructor({ transport = null, kind = 'solo', name = '', hero = 0, settings = {} } = {}) {
    super();
    this.transport = transport; this.kind = kind; this.isHost = true;
    this.settings = { duration: DEFAULT_DURATION, bots: true, ...settings };
    this.roster = [{ peer: 'local', name, hero, ping: 0 }];
    this.peers = new Map();
    this.state = 'lobby';
    this.match = null; this.paused = false; this.acc = 0; this.localButtons = 0; this.localPlayerId = -1;
    this.pingT = 0; this.rosterT = 0; this.time = 0;
    this.view = { mode: kind === 'solo' ? 'solo' : 'host', localId: -1, phase: 'lobby', players: [], traps: [], myTarget: -1, remaining: 0, duration: this.settings.duration, countdown: 0, results: null };
    if (transport) {
      this.offs = [
        transport.on('peer-join', ({ id }) => this._peerJoin(id)),
        transport.on('peer-leave', ({ id }) => this._peerLeave(id)),
        transport.on('message', ({ from, bytes }) => this._message(from, bytes)),
        transport.on('close', () => this.emit('closed', { reason: 'error' }))
      ];
    }
  }

  get humans() { return this.roster.length; }
  lobbyState() {
    return {
      kind: this.kind, isHost: true, state: this.state, settings: { ...this.settings },
      roster: this.roster.map(r => ({ name: r.name, hero: r.hero, host: r.peer === 'local', you: r.peer === 'local', ping: r.ping | 0 })),
      canStart: this.settings.bots || this.roster.length > 1
    };
  }
  _rosterMsg() {
    return { roster: this.roster.map(r => ({ name: r.name, hero: r.hero, host: r.peer === 'local', peer: r.peer, ping: r.ping | 0 })), settings: this.settings, state: this.state };
  }
  _broadcastRoster() {
    if (!this.transport) return;
    const body = this._rosterMsg();
    for (const peer of this.peers.values()) this.transport.send(peer.id, encodeJson(MSG.ROSTER, { ...body, you: peer.id }), true);
    this.emit('lobby', this.lobbyState());
  }

  setLocal({ name, hero }) {
    const me = this.roster[0];
    if (name != null) me.name = name;
    if (hero != null && this.state !== 'match') {
      const taken = new Set(this.roster.slice(1).map(r => r.hero));
      if (!taken.has(hero)) me.hero = hero;
    }
    this._broadcastRoster();
  }
  setSettings(s) {
    if (s.duration && MATCH_DURATIONS.includes(s.duration)) this.settings.duration = s.duration;
    if (s.bots != null) this.settings.bots = !!s.bots;
    this._broadcastRoster();
  }

  // ---- peers -----------------------------------------------------------------
  _peerJoin(id) { if (!this.peers.has(id)) this.peers.set(id, { id, hello: false, playerId: -1, queue: [], lastSeq: 0, ack: 0, lastMx: 0, lastMz: 0, lastSeen: this.time, ping: 0, carry: 0, starve: 0, active: false }); }
  _peerLeave(id) {
    const peer = this.peers.get(id);
    if (!peer) return;
    this.peers.delete(id);
    const idx = this.roster.findIndex(r => r.peer === id);
    const name = idx >= 0 ? this.roster[idx].name : '';
    if (idx >= 0) this.roster.splice(idx, 1);
    if (this.match && peer.playerId >= 0) {
      setBot(this.match, peer.playerId, true, '');
      this.matchRoster[peer.playerId].bot = true; this.matchRoster[peer.playerId].peer = null; this.matchRoster[peer.playerId].name = '';
      this._broadcast(MSG.LOBBY, { left: name, matchRoster: this._publicMatchRoster() });
    }
    if (peer.hello) this.emit('peer-left', { name, inMatch: !!this.match && this.state === 'match' });
    this._broadcastRoster();
  }
  _broadcast(type, obj) { if (this.transport) for (const p of this.peers.values()) if (p.hello) this.transport.send(p.id, encodeJson(type, obj), true); }
  _publicMatchRoster() { return (this.matchRoster || []).map(p => ({ id: p.id, hero: p.hero, name: p.name, bot: p.bot })); }

  _message(from, bytes) {
    let peer = this.peers.get(from);
    if (!peer) { this._peerJoin(from); peer = this.peers.get(from); }
    peer.lastSeen = this.time;
    if (!bytes?.length) return;
    const type = typeOf(bytes);
    try {
      if (type === MSG.INPUT) { if (peer.hello) this._inputs(peer, decodeInputs(bytes)); return; }
      const msg = decodeJson(bytes);
      if (type === MSG.HELLO) this._hello(peer, msg);
      else if (type === MSG.PICK && peer.hello && this.state !== 'match') {
        const r = this.roster.find(x => x.peer === peer.id);
        const taken = new Set(this.roster.filter(x => x !== r).map(x => x.hero));
        if (r && Number.isInteger(msg.hero) && msg.hero >= 0 && msg.hero < HEROES.length && !taken.has(msg.hero)) r.hero = msg.hero;
        this._broadcastRoster();
      } else if (type === MSG.PONG) { peer.ping = Math.max(0, Math.round(performance.now() - msg.t)); const r = this.roster.find(x => x.peer === peer.id); if (r) r.ping = peer.ping; }
      else if (type === MSG.BYE) this.transport?.kick?.(peer.id) ?? this._peerLeave(peer.id);
    } catch (e) { console.warn('bad message from', from, e); }
  }

  _hello(peer, msg) {
    if (peer.hello) return;
    if (msg.proto !== PROTOCOL_VERSION) { this.transport.send(peer.id, encodeJson(MSG.REJECT, { reason: 'version', version: GAME_VERSION }), true); return; }
    if (this.roster.length >= MAX_PLAYERS) { this.transport.send(peer.id, encodeJson(MSG.REJECT, { reason: 'full' }), true); return; }
    peer.hello = true;
    const name = String(msg.name || '').slice(0, 20).trim() || 'Player';
    const hero = freeHero(new Set(this.roster.map(r => r.hero)), msg.hero | 0);
    this.roster.push({ peer: peer.id, name, hero, ping: 0 });
    let playerId = -1;
    if (this.match && this.state === 'match') {
      const slot = this.matchRoster.find(p => p.bot);
      if (slot) {
        slot.bot = false; slot.peer = peer.id; slot.name = name; playerId = slot.id;
        setBot(this.match, slot.id, false, name);
        this._broadcast(MSG.LOBBY, { joined: name, matchRoster: this._publicMatchRoster() });
      }
    }
    peer.playerId = playerId;
    this.transport.send(peer.id, encodeJson(MSG.WELCOME, {
      you: peer.id, version: GAME_VERSION, ...this._rosterMsg(),
      match: this.match && this.state !== 'lobby' ? { roster: this._publicMatchRoster(), duration: this.match.duration, playerId, phase: this.match.phase, results: this.match.results } : null
    }), true);
    this.emit('peer-joined', { name, inMatch: this.state === 'match' });
    this._broadcastRoster();
  }

  _inputs(peer, list) {
    for (const inp of list) {
      if (inp.seq <= peer.lastSeq) continue;
      peer.lastSeq = inp.seq;
      if (inp.seq <= peer.ack) { peer.carry |= inp.buttons; continue; }   // already stood in for it (see _tick)
      peer.queue.push(inp);
    }
    peer.active = true;
    if (peer.queue.length > MAX_QUEUE) {
      let buttons = 0;
      while (peer.queue.length > MAX_QUEUE) { const old = peer.queue.shift(); buttons |= old.buttons; peer.ack = old.seq; }
      peer.queue[0].buttons |= buttons;
    }
  }
  // One tick worth of inputs for a remote player. A short gap is bridged by
  // repeating the last movement *as* the next input (and acknowledging it), a
  // backlog is drained two inputs per tick — the host replays exactly the
  // client's input stream, so the client's prediction rarely needs correcting.
  _takeInputs(peer) {
    const q = peer.queue, list = [];
    const take = q.length >= 3 ? 2 : q.length ? 1 : 0;
    for (let i = 0; i < take; i++) {
      const inp = q.shift();
      if (peer.carry) { inp.buttons |= peer.carry; peer.carry = 0; }
      list.push(inp); peer.ack = inp.seq; peer.lastMx = inp.mx; peer.lastMz = inp.mz;
    }
    if (take) { peer.starve = 0; return list; }
    peer.starve++;
    if (!peer.active) return [{ mx: 0, mz: 0, buttons: 0 }];
    if (peer.starve <= 8) { peer.ack++; return [{ mx: peer.lastMx, mz: peer.lastMz, buttons: 0 }]; }
    return [{ mx: 0, mz: 0, buttons: 0 }];                                  // client stalled: stand still
  }

  // ---- match -------------------------------------------------------------------
  start() {
    if (this.state === 'match' && this.match?.phase !== 'ended') return false;
    const humans = this.roster.slice(0, MAX_PLAYERS);
    if (!this.settings.bots && humans.length < 2) return false;
    const players = humans.map((h, i) => ({ id: i, hero: h.hero, name: h.name, bot: false, peer: h.peer }));
    if (this.settings.bots) {
      const taken = new Set(players.map(p => p.hero));
      for (let h = 0; h < HEROES.length && players.length < MAX_PLAYERS; h++) if (!taken.has(h)) players.push({ id: players.length, hero: h, name: '', bot: true, peer: null });
    }
    this.matchRoster = players;
    this.match = createMatch({ seed: randomSeed(), roster: players, duration: this.settings.duration });
    this.state = 'match'; this.acc = 0; this.localButtons = 0; this.paused = false;
    this.localPlayerId = players.findIndex(p => p.peer === 'local');
    for (const peer of this.peers.values()) {
      peer.playerId = players.findIndex(p => p.peer === peer.id);
      peer.queue = []; peer.ack = peer.lastSeq; peer.lastMx = 0; peer.lastMz = 0; peer.carry = 0; peer.starve = 0; peer.active = false;
      if (peer.hello) this.transport.send(peer.id, encodeJson(MSG.START, { roster: this._publicMatchRoster(), duration: this.match.duration, playerId: peer.playerId }), true);
    }
    Object.assign(this.view, { localId: this.localPlayerId, players: this.match.players, traps: this.match.traps, results: null, duration: this.match.duration });
    this._syncView();
    this.emit('match-start', { roster: this._publicMatchRoster(), localId: this.localPlayerId, duration: this.match.duration });
    this._broadcastRoster();
    return true;
  }
  _syncView() {
    const m = this.match, v = this.view;
    v.phase = m.phase; v.countdown = m.countdown; v.remaining = m.remaining;
    v.myTarget = this.localPlayerId >= 0 ? m.players[this.localPlayerId].target : -1;
  }
  backToLobby() {
    this.state = 'lobby'; this.match = null; this.view.phase = 'lobby'; this.view.players = []; this.view.traps = [];
    this._broadcast(MSG.LOBBY, { back: true });
    this._broadcastRoster();
  }

  update(frameDt, input = {}) {
    this.time += frameDt;
    this.localButtons |= input.buttons | 0;
    if (this.transport) this._housekeeping(frameDt);
    if (this.state !== 'match' || !this.match || this.paused) return;
    this.acc += Math.min(frameDt, .25);
    let steps = 0;
    while (this.acc >= DT && steps < 8) { this.acc -= DT; steps++; this._tick(input); }
    if (steps >= 8) this.acc = 0;
  }
  _housekeeping(dt) {
    this.pingT -= dt;
    if (this.pingT <= 0) {
      this.pingT = 1;
      const t = performance.now();
      for (const p of this.peers.values()) if (p.hello) this.transport.send(p.id, encodeJson(MSG.PING, { t }), true);
      for (const p of [...this.peers.values()]) if (this.time - p.lastSeen > PEER_TIMEOUT) this._peerLeave(p.id);
      this.rosterT -= 1;
      if (this.rosterT <= 0) { this.rosterT = 3; if (this.peers.size) this._broadcastRoster(); }
    }
  }
  _tick(localInput) {
    const m = this.match, inputs = [];
    if (this.localPlayerId >= 0) { inputs[this.localPlayerId] = { mx: localInput.mx || 0, mz: localInput.mz || 0, buttons: this.localButtons }; this.localButtons = 0; }
    for (const peer of this.peers.values()) {
      if (peer.playerId < 0 || m.players[peer.playerId].bot) continue;
      inputs[peer.playerId] = this._takeInputs(peer);
    }
    stepMatch(m, inputs);
    const events = drainEvents(m);
    this._syncView();
    if (events.length) {
      this.emit('events', events);
      if (this.transport) for (const peer of this.peers.values()) {
        if (!peer.hello) continue;
        const list = events.filter(e => !PRIVATE.has(e.type) || e.p === peer.playerId);
        if (list.length) this.transport.send(peer.id, encodeJson(MSG.EVENTS, { ev: list }), true);
      }
    }
    if (this.transport && m.tick % SNAPSHOT_EVERY === 0) {
      for (const peer of this.peers.values()) if (peer.hello) this.transport.send(peer.id, encodeSnapshot(m, peer.ack, peer.playerId), false);
    }
    if (m.phase === 'ended' && this.state === 'match') {
      this.state = 'results'; this.view.results = m.results;
      this._broadcast(MSG.END, { results: m.results });
      this.emit('match-end', { results: m.results });
      this._broadcastRoster();
    }
  }

  setPaused(p) { if (this.kind === 'solo') this.paused = !!p; }
  leave() {
    if (this.transport) { this._broadcast(MSG.BYE, {}); const t = this.transport; setTimeout(() => t.close(), 120); }
    for (const off of this.offs || []) off();
    this.state = 'closed';
  }
}

// ============================================================================
export class ClientSession extends Emitter {
  constructor({ transport, kind = 'lan', name = '', hero = 0 }) {
    super();
    this.transport = transport; this.kind = kind; this.isHost = false; this.name = name; this.hero = hero;
    this.state = 'connecting'; this.roster = []; this.settings = {}; this.playerId = -1;
    this.snaps = []; this.pending = []; this.seq = 0; this.acc = 0; this.buttons = 0; this.clock = -1; this.lastHeard = 0; this.time = 0;
    this.eventQueue = []; this.smooth = { x: 0, z: 0 }; this.pred = null; this.interp = INTERP_TICKS; this.lastSnapTick = 0;
    this.view = { mode: 'client', localId: -1, phase: 'lobby', players: [], traps: [], myTarget: -1, remaining: 0, duration: DEFAULT_DURATION, countdown: 0, results: null };
    this.offs = [
      transport.on('message', ({ from, bytes }) => { if (from === transport.hostId) this._message(bytes); }),
      transport.on('close', ({ reason }) => this._closed(reason || 'hostLeft'))
    ];
  }
  hello() { this.transport.send(this.transport.hostId, encodeJson(MSG.HELLO, { name: this.name, hero: this.hero, proto: PROTOCOL_VERSION, version: GAME_VERSION }), true); }
  _closed(reason) { if (this.state === 'closed') return; this.state = 'closed'; this.emit('closed', { reason }); }
  lobbyState() {
    return {
      kind: this.kind, isHost: false, state: this.state, settings: { ...this.settings },
      roster: this.roster.map(r => ({ name: r.name, hero: r.hero, host: r.host, you: r.peer === this.selfPeer, ping: r.ping | 0 })),
      canStart: false
    };
  }
  pickHero(hero) { this.hero = hero; this.transport.send(this.transport.hostId, encodeJson(MSG.PICK, { hero }), true); }
  setLocal({ hero }) { if (hero != null) this.pickHero(hero); }

  _message(bytes) {
    this.lastHeard = this.time;
    const type = typeOf(bytes);
    try {
      if (type === MSG.SNAP) { this._snapshot(decodeSnapshot(bytes)); return; }
      const msg = decodeJson(bytes);
      switch (type) {
        case MSG.WELCOME:
          this.selfPeer = msg.you; this._roster(msg); this.state = msg.state === 'lobby' ? 'lobby' : msg.state;
          this.emit('welcome', {});
          this.emit('lobby', this.lobbyState());
          if (msg.match) {
            this._setupMatch(msg.match);
            this.emit('match-start', { roster: msg.match.roster, localId: this.playerId, duration: msg.match.duration, late: true });
            if (msg.match.playerId < 0) this.emit('spectate', {});
            if (msg.match.results) { this.view.phase = 'ended'; this.emit('match-end', { results: msg.match.results }); }
          }
          break;
        case MSG.REJECT: this._closed(msg.reason === 'version' ? 'version:' + (msg.version || '?') : msg.reason || 'full'); break;
        case MSG.ROSTER: this.selfPeer = msg.you ?? this.selfPeer; this._roster(msg); if (this.state === 'lobby' || this.state === 'results') this.emit('lobby', this.lobbyState()); break;
        case MSG.START: this.state = 'match'; this._setupMatch(msg); this.emit('match-start', { roster: msg.roster, localId: msg.playerId, duration: msg.duration }); break;
        case MSG.EVENTS: for (const e of msg.ev || []) this.eventQueue.push(e); break;
        case MSG.END: this.state = 'results'; this.view.results = msg.results; this.view.phase = 'ended'; this._flushEvents(true); this.emit('match-end', { results: msg.results }); break;
        case MSG.LOBBY:
          if (msg.matchRoster && this.matchRoster) { this._applyMatchRoster(msg.matchRoster); }
          if (msg.left) this.emit('peer-left', { name: msg.left, inMatch: this.state === 'match' });
          if (msg.joined) this.emit('peer-joined', { name: msg.joined, inMatch: this.state === 'match' });
          if (msg.back) { this.state = 'lobby'; this.view.phase = 'lobby'; this.view.players = []; this.emit('lobby', this.lobbyState()); this.emit('back-to-lobby', {}); }
          break;
        case MSG.PING: this.transport.send(this.transport.hostId, encodeJson(MSG.PONG, { t: msg.t }), true); break;
        case MSG.BYE: this._closed('hostLeft'); break;
      }
    } catch (e) { console.warn('bad host message', e); }
  }
  _roster(msg) { this.roster = msg.roster || []; this.settings = msg.settings || this.settings; if (msg.state) this.hostState = msg.state; }
  _applyMatchRoster(list) {
    this.matchRoster = list;
    for (const r of list) { const p = this.view.players[r.id]; if (p) { p.name = r.name; p.bot = r.bot; } }
  }
  _setupMatch(info) {
    this.matchRoster = info.roster;
    this.playerId = info.playerId ?? -1;
    this.snaps = []; this.pending = []; this.eventQueue = []; this.clock = -1; this.acc = 0; this.buttons = 0; this.smooth = { x: 0, z: 0 };
    const mk = r => ({ id: r.id, hero: r.hero, name: r.name, bot: r.bot, x: 0, z: 0, vx: 0, vz: 0, fx: 0, fz: 1, dead: 0, caught: 0, shield: 0, slip: 0, attackT: 0, dashT: 0, trapCD: 0, hitAge: 0, disguise: 0, disguiseCD: 0, disguiseHero: -1, disguiseAs: -1, score: 0, speed: 0, target: -1, hidden: 0, fresh: true });
    const v = this.view;
    v.players = info.roster.map(mk); v.localId = this.playerId; v.duration = info.duration; v.remaining = info.duration;
    v.traps = TRAPS.map((t, i) => ({ id: i, x: t.x, z: t.z, type: t.type, owner: -1, warm: 0, active: 0 }));
    v.phase = info.phase || 'countdown'; v.countdown = 3; v.results = info.results || null; v.myTarget = -1;
    this.pred = this.playerId >= 0 ? { ...mk(info.roster[this.playerId]), ready: false } : null;
  }

  _snapshot(s) {
    if (!this.matchRoster || s.players.length !== this.view.players.length) return;
    if (s.tick <= this.lastSnapTick) return;          // out of order / duplicate
    this.lastSnapTick = s.tick;
    this.snaps.push(s);
    while (this.snaps.length > 30) this.snaps.shift();
    if (this.clock < 0 || Math.abs(s.tick - this.clock) > 40) this.clock = s.tick;
    else this.clock += (s.tick - this.clock) * .08;
    const v = this.view;
    v.phase = this.state === 'results' ? 'ended' : s.phase; v.countdown = s.countdown; v.remaining = s.remaining; v.myTarget = s.myTarget;
    // Reconcile our own hero: take the host's state, replay unacknowledged inputs.
    if (this.pred && this.playerId >= 0) {
      const a = s.players[this.playerId], p = this.pred;
      const oldX = p.x, oldZ = p.z;
      for (const k of ['x', 'z', 'vx', 'vz', 'fx', 'fz', 'dead', 'caught', 'shield', 'slip', 'attackT', 'dashT', 'trapCD', 'hitAge', 'disguise', 'disguiseCD', 'disguiseHero', 'disguiseAs', 'score', 'bot']) p[k] = a[k];
      this.pending = this.pending.filter(i => i.seq > s.ack);
      for (const inp of this.pending) this._predict(inp, false);
      if (p.ready) {
        this.smooth.x += oldX - p.x; this.smooth.z += oldZ - p.z;
        if (Math.hypot(this.smooth.x, this.smooth.z) > 2.5) this.smooth.x = this.smooth.z = 0;
      }
      p.ready = true;
    }
  }

  _predict(inp, live) {
    const p = this.pred;
    if (!p || this.view.phase !== 'play') return;
    p.dashT = Math.max(0, p.dashT - DT); p.attackT = Math.max(0, p.attackT - DT); p.shield = Math.max(0, p.shield - DT); p.hitAge = Math.max(0, p.hitAge - DT);
    if (p.dead > 0) return;
    p.slip = Math.max(0, p.slip - DT);
    if (p.caught > 0) return;
    if (inp.buttons & BTN.ATTACK && p.attackT <= 0) { p.attackT = R.attackCooldown; if (live) this.emit('local-event', { type: 'attack', p: this.playerId, x: p.x, z: p.z, local: true }); }
    if (inp.buttons & BTN.DASH && p.dashT <= 0) { p.dashT = R.dashCooldown; p.vx += p.fx * R.dashForce; p.vz += p.fz * R.dashForce; if (live) this.emit('local-event', { type: 'dash', p: this.playerId, x: p.x, z: p.z, local: true }); }
    integrate(p, inp.mx, inp.mz, DT, R.speedHuman);
    if (outOfBounds(p) && p.shield > 0) clampInside(p);
  }

  update(frameDt, input = {}) {
    this.time += frameDt;
    if (this.state !== 'closed' && this.lastHeard && this.time - this.lastHeard > HOST_TIMEOUT) { this._closed('kicked'); return; }
    if (!this.matchRoster || this.state === 'lobby') return;
    this.buttons |= input.buttons | 0;
    // Fixed 60 Hz input ticks (prediction + sending).
    this.acc += Math.min(frameDt, .25);
    let steps = 0;
    while (this.acc >= DT && steps < 8) {
      this.acc -= DT; steps++;
      if (this.playerId < 0 || this.state !== 'match') continue;
      // Quantise exactly like the wire format, then sanitise exactly like the host.
      const inp = { seq: ++this.seq, ...sanitizeInput({ mx: quant(input.mx || 0), mz: quant(input.mz || 0), buttons: this.buttons & 15 }) };
      this.buttons = 0;
      this.pending.push(inp);
      if (this.pending.length > 240) this.pending.shift();
      this._predict(inp, true);
      if (this.seq % INPUT_SEND_EVERY === 0) this.transport.send(this.transport.hostId, encodeInputs(this.pending.slice(-INPUT_REDUNDANCY)), false);
    }
    if (steps >= 8) this.acc = 0;
    if (this.clock >= 0) this.clock += frameDt * 60;
    this._interpolate(frameDt);
    this._flushEvents(false);
  }

  _interpolate(frameDt) {
    const snaps = this.snaps, v = this.view;
    if (!snaps.length) return;
    const renderTick = this.clock - this.interp;
    let a = snaps[0], b = snaps[0];
    for (let i = snaps.length - 1; i >= 0; i--) { if (snaps[i].tick <= renderTick) { a = snaps[i]; b = snaps[i + 1] || snaps[i]; break; } }
    const span = b.tick - a.tick, t = span > 0 ? Math.max(0, Math.min(1, (renderTick - a.tick) / span)) : 0;
    for (let i = 0; i < v.players.length; i++) {
      const p = v.players[i], pa = a.players[i], pb = b.players[i];
      if (!pa) continue;
      const jump = Math.hypot(pb.x - pa.x, pb.z - pa.z) > 3;
      const src = t > .5 ? pb : pa;
      if (i === this.playerId && this.pred?.ready) {
        const pr = this.pred;
        const k = Math.exp(-frameDt * 12);
        this.smooth.x *= k; this.smooth.z *= k;
        p.x = pr.x + this.smooth.x; p.z = pr.z + this.smooth.z;
        for (const key of ['fx', 'fz', 'vx', 'vz', 'dashT', 'attackT', 'slip']) p[key] = pr[key];
        for (const key of ['dead', 'caught', 'shield', 'trapCD', 'hitAge', 'disguise', 'disguiseCD', 'disguiseHero', 'disguiseAs', 'score', 'speed']) p[key] = snaps[snaps.length - 1].players[i][key];
      } else {
        p.x = jump ? src.x : pa.x + (pb.x - pa.x) * t; p.z = jump ? src.z : pa.z + (pb.z - pa.z) * t;
        p.fx = pa.fx + (pb.fx - pa.fx) * t; p.fz = pa.fz + (pb.fz - pa.fz) * t;
        for (const key of ['vx', 'vz', 'attackT', 'dashT', 'hitAge', 'shield', 'caught', 'slip', 'speed']) p[key] = pa[key] + (pb[key] - pa[key]) * t;
        for (const key of ['dead', 'disguise', 'disguiseCD', 'disguiseHero', 'disguiseAs', 'score', 'trapCD']) p[key] = src[key];
        if (src.dead > 0) p.dead = Math.max(p.dead, .001);
      }
      p.bot = src.bot;
      if (p.hidden > 0) { p.hidden = Math.max(0, p.hidden - frameDt); if (p.dead > 0) p.hidden = 0; }
    }
    const latest = snaps[snaps.length - 1];
    for (let i = 0; i < v.traps.length; i++) { const s = (t > .5 ? b : a).traps[i]; if (s) Object.assign(v.traps[i], { owner: s.owner, warm: s.warm, active: s.active }); }
    v.renderTick = renderTick; v.latestTick = latest.tick;
  }

  _flushEvents(all) {
    if (!this.eventQueue.length) return;
    const renderTick = this.clock - this.interp, me = this.playerId, out = [];
    const mine = e => e.p === me || e.v === me;
    const rest = [];
    for (const e of this.eventQueue) {
      if (all || mine(e) || e.tick <= renderTick || e.type === 'count' || e.type === 'go' || e.type === 'end') {
        if ((e.type === 'attack' || e.type === 'dash') && e.p === me) continue;   // shown instantly by prediction
        out.push(e);
      } else rest.push(e);
    }
    this.eventQueue = rest;
    for (const e of out) {
      if (e.type === 'elim') { const p = this.view.players[e.v]; if (p && e.v !== me) p.hidden = .6; }
    }
    if (out.length) this.emit('events', out);
  }

  leave() {
    try { this.transport.send(this.transport.hostId, encodeJson(MSG.BYE, {}), true); } catch { /* ignore */ }
    const t = this.transport; setTimeout(() => t.close(), 120);
    for (const off of this.offs) off();
    this.state = 'closed';
  }
}
