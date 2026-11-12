// Transports hide how bytes travel (WebSocket relay, Steam P2P, in-memory).
// Sessions only see: peers joining/leaving, messages, and send/broadcast.
export class Emitter {
  constructor() { this._h = new Map(); }
  on(type, fn) { if (!this._h.has(type)) this._h.set(type, new Set()); this._h.get(type).add(fn); return () => this._h.get(type)?.delete(fn); }
  emit(type, data) { for (const fn of [...(this._h.get(type) || [])]) { try { fn(data); } catch (e) { console.error(e); } } }
}

// ---- WebSocket relay (LAN host inside the desktop app, or `npm run web`) ------
// Frames: text = JSON control, binary = [u16 peer][payload]. Peer 1 is the host.
export class WsTransport extends Emitter {
  constructor(url, { role, room = '', name = '', proto = 1, timeout = 6000 } = {}) {
    super();
    this.url = url; this.role = role; this.room = room; this.name = name; this.proto = proto; this.timeout = timeout;
    this.kind = 'ws'; this.selfId = null; this.hostId = 'ws:1'; this.peers = new Set(); this.closed = false;
  }
  open() {
    return new Promise((resolve, reject) => {
      let ws;
      try { ws = new WebSocket(this.url); } catch (e) { reject(Object.assign(new Error('connect'), { code: 'connect' })); return; }
      ws.binaryType = 'arraybuffer';
      this.ws = ws;
      let settled = false;
      const fail = code => { if (settled) return; settled = true; clearTimeout(timer); try { ws.close(); } catch { /* ignore */ } reject(Object.assign(new Error(code), { code })); };
      const timer = setTimeout(() => fail('timeout'), this.timeout);
      ws.onopen = () => ws.send(JSON.stringify({ op: this.role === 'host' ? 'host' : 'join', room: this.room, name: this.name, proto: this.proto }));
      ws.onerror = () => fail('connect');
      ws.onclose = () => {
        if (!settled) { fail('connect'); return; }
        if (!this.closed) { this.closed = true; this.emit('close', { reason: this.role === 'host' ? 'error' : 'hostLeft' }); }
      };
      ws.onmessage = ev => {
        if (typeof ev.data === 'string') {
          let msg; try { msg = JSON.parse(ev.data); } catch { return; }
          if (msg.op === 'hosted' || msg.op === 'joined') {
            this.selfId = 'ws:' + msg.id; this.room = msg.room || this.room;
            if (!settled) { settled = true; clearTimeout(timer); resolve(this); }
          } else if (msg.op === 'error') fail(msg.code || 'error');
          else if (msg.op === 'peer' && msg.event === 'join') { this.peers.add('ws:' + msg.id); this.emit('peer-join', { id: 'ws:' + msg.id, name: msg.name }); }
          else if (msg.op === 'peer' && msg.event === 'leave') { this.peers.delete('ws:' + msg.id); this.emit('peer-leave', { id: 'ws:' + msg.id }); }
          else if (msg.op === 'host-left') { this.closed = true; this.emit('close', { reason: 'hostLeft' }); try { ws.close(); } catch { /* ignore */ } }
          return;
        }
        const data = new Uint8Array(ev.data);
        if (data.length < 3) return;
        const from = 'ws:' + ((data[0] << 8) | data[1]);
        this.emit('message', { from, bytes: data.subarray(2) });
      };
    });
  }
  _frame(to, bytes) { const f = new Uint8Array(bytes.length + 2); f[0] = to >> 8; f[1] = to & 255; f.set(bytes, 2); return f; }
  send(peer, bytes) { if (this.ws?.readyState === 1) this.ws.send(this._frame(+String(peer).slice(3), bytes)); }
  broadcast(bytes) { if (this.ws?.readyState === 1) this.ws.send(this._frame(0xffff, bytes)); }
  close() { this.closed = true; try { this.ws?.close(); } catch { /* ignore */ } }
}

// ---- Steam lobby + P2P through the desktop app's native bridge ---------------
export class SteamTransport extends Emitter {
  constructor(steam) {
    super();
    this.steam = steam; this.kind = 'steam'; this.peers = new Set(); this.members = new Set(); this.closed = false; this.offs = [];
  }
  async _attach(info, role) {
    this.role = role; this.lobbyId = info.lobbyId; this.selfId = info.selfId; this.hostId = info.ownerId;
    this.members = new Set(info.members || []);
    this.offs.push(this.steam.onPacket((from, data) => {
      if (this.closed) return;
      if (role === 'host') {
        if (!this.members.has(from)) return;            // only lobby members may talk to us
        if (!this.peers.has(from)) { this.peers.add(from); this.emit('peer-join', { id: from }); }
      } else if (from !== this.hostId) return;
      this.emit('message', { from, bytes: data instanceof Uint8Array ? data : new Uint8Array(data) });
    }));
    this.offs.push(this.steam.onLobby(ev => {
      if (this.closed || ev.lobbyId !== this.lobbyId) return;
      this.members = new Set(ev.members);
      if (role === 'host') {
        for (const p of [...this.peers]) if (!this.members.has(p)) { this.peers.delete(p); this.emit('peer-leave', { id: p }); }
      } else if (!this.members.has(this.hostId) || (ev.ownerId && ev.ownerId !== this.hostId)) {
        this.closed = true; this.emit('close', { reason: 'hostLeft' });
      }
    }));
    this.offs.push(this.steam.onP2PFail(ev => {
      if (this.closed) return;
      if (role === 'host' && this.peers.has(ev.remote)) { this.peers.delete(ev.remote); this.emit('peer-leave', { id: ev.remote }); }
      if (role === 'client' && ev.remote === this.hostId) { this.closed = true; this.emit('close', { reason: 'kicked' }); }
    }));
    return this;
  }
  async host(maxMembers = 8) {
    const info = await this.steam.createLobby(maxMembers);
    if (!info?.lobbyId) throw Object.assign(new Error('steam-create'), { code: 'steamCreate' });
    return this._attach(info, 'host');
  }
  async join(lobbyId) {
    const info = await this.steam.joinLobby(String(lobbyId));
    if (!info?.lobbyId) throw Object.assign(new Error('steam-join'), { code: 'steamJoin' });
    return this._attach(info, 'client');
  }
  send(peer, bytes, reliable = true) { this.steam.send(peer, bytes, reliable); }
  broadcast(bytes, reliable = true) { for (const p of this.peers) this.steam.send(p, bytes, reliable); }
  invite() { this.steam.invite(); }
  close() { if (this.closed) return; this.closed = true; for (const off of this.offs) off?.(); this.steam.leaveLobby(); }
}

// ---- In-memory pair (tests, and a local "loopback" for debugging) ------------
// latencyFrames > 0 queues packets until net.pump() has been called that many
// times, which makes lag/loss tests deterministic.
export function createLocalNetwork({ latency = 0, latencyFrames = 0, loss = 0, jitterFrames = 0, rand = Math.random } = {}) {
  const nodes = new Map(), queue = [];
  let nextId = 1, frame = 0;
  const deliver = (to, from, bytes, reliable) => {
    const t = nodes.get(to);
    if (!t || t.closed) return;
    if (!reliable && loss && rand() < loss) return;
    const copy = bytes.slice();
    const go = () => { if (!t.closed) t.emit('message', { from, bytes: copy }); };
    if (latencyFrames) {
      let due = frame + latencyFrames + (jitterFrames ? Math.floor(rand() * (jitterFrames + 1)) : 0);
      if (reliable) { const last = queue.filter(q => q.to === to && q.reliable).reduce((m, q) => Math.max(m, q.due), 0); due = Math.max(due, last); }
      queue.push({ due, go, to, reliable });
    } else if (latency) setTimeout(go, latency); else queueMicrotask(go);
  };
  class LocalTransport extends Emitter {
    constructor(role) { super(); this.kind = 'local'; this.role = role; this.peers = new Set(); this.closed = false; }
    async open() {
      this.selfId = 'lo:' + nextId++;
      nodes.set(this.selfId, this);
      if (this.role === 'host') net.hostId = this.selfId;
      else {
        const host = nodes.get(net.hostId);
        if (!host) throw Object.assign(new Error('no-room'), { code: 'noRoom' });
        this.hostId = net.hostId;
        host.peers.add(this.selfId);
        queueMicrotask(() => host.emit('peer-join', { id: this.selfId }));
      }
      this.hostId = net.hostId;
      return this;
    }
    send(peer, bytes, reliable = true) { deliver(peer, this.selfId, bytes, reliable); }
    broadcast(bytes, reliable = true) { for (const p of this.peers) deliver(p, this.selfId, bytes, reliable); }
    close() {
      if (this.closed) return;
      this.closed = true; nodes.delete(this.selfId);
      if (this.role === 'host') { for (const p of this.peers) { const t = nodes.get(p); if (t && !t.closed) { t.closed = true; t.emit('close', { reason: 'hostLeft' }); } } }
      else { const h = nodes.get(this.hostId); if (h) { h.peers.delete(this.selfId); h.emit('peer-leave', { id: this.selfId }); } }
    }
  }
  const net = {
    hostId: null, host: () => new LocalTransport('host'), client: () => new LocalTransport('client'),
    pump() {
      frame++;
      const due = queue.filter(q => q.due <= frame);
      for (const q of due) queue.splice(queue.indexOf(q), 1);
      due.sort((a, b) => a.due - b.due);
      for (const q of due) q.go();
    }
  };
  return net;
}
