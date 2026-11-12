// Wire format. Control messages are [type byte][UTF-8 JSON]; the two hot
// messages (host snapshots, client inputs) are compact binary so a full
// 8-player snapshot is ~240 bytes — well under Steam's 1200-byte unreliable limit.
export const MSG = {
  HELLO: 1, WELCOME: 2, ROSTER: 3, START: 4, INPUT: 5, SNAP: 6, EVENTS: 7, END: 8,
  PICK: 9, BYE: 10, PING: 11, PONG: 12, REJECT: 13, LOBBY: 14
};
const PHASES = ['countdown', 'play', 'ended'];
const te = new TextEncoder(), td = new TextDecoder();

export function encodeJson(type, obj) {
  const body = te.encode(JSON.stringify(obj ?? {}));
  const out = new Uint8Array(body.length + 1);
  out[0] = type; out.set(body, 1);
  return out;
}
export function decodeJson(bytes) { return JSON.parse(td.decode(bytes.subarray(1))); }
export const typeOf = bytes => bytes[0];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const q = (v, s, lo, hi) => clamp(Math.round((Number.isFinite(v) ? v : 0) * s), lo, hi);
const PLAYER_BYTES = 26;

export function encodeSnapshot(m, ack, recipientId) {
  const n = m.players.length, tn = m.traps.length;
  const buf = new ArrayBuffer(15 + n * PLAYER_BYTES + 1 + tn * 3), dv = new DataView(buf);
  let o = 0;
  dv.setUint8(o++, MSG.SNAP);
  dv.setUint32(o, m.tick >>> 0); o += 4;
  dv.setUint16(o, q(m.remaining, 10, 0, 65535)); o += 2;
  dv.setUint8(o++, Math.max(0, PHASES.indexOf(m.phase)));
  dv.setUint8(o++, q(m.countdown, 50, 0, 255));
  dv.setUint32(o, ack >>> 0); o += 4;
  const me = recipientId >= 0 ? m.players[recipientId] : null;
  dv.setInt8(o++, me ? me.target : -1);
  dv.setUint8(o++, n);
  for (const p of m.players) {
    dv.setUint8(o++, p.id);
    dv.setInt16(o, q(p.x, 100, -32768, 32767)); o += 2;
    dv.setInt16(o, q(p.z, 100, -32768, 32767)); o += 2;
    dv.setInt16(o, q(p.vx, 100, -32768, 32767)); o += 2;
    dv.setInt16(o, q(p.vz, 100, -32768, 32767)); o += 2;
    dv.setInt8(o++, q(p.fx, 127, -127, 127));
    dv.setInt8(o++, q(p.fz, 127, -127, 127));
    dv.setUint8(o++, (p.dead > 0 ? 1 : 0) | (p.caught > 0 ? 2 : 0) | (p.bot ? 4 : 0) | (p.slip > 0 ? 8 : 0) | (p.shield > 0 ? 16 : 0));
    dv.setUint8(o++, q(p.dead, 40, 0, 255));
    dv.setUint8(o++, q(p.attackT, 200, 0, 255));
    dv.setUint8(o++, q(p.dashT, 50, 0, 255));
    dv.setUint8(o++, q(p.trapCD, 25, 0, 255));
    dv.setUint8(o++, q(p.disguise, 20, 0, 255));
    dv.setUint8(o++, q(p.disguiseCD, 8, 0, 255));
    dv.setInt8(o++, p.disguiseHero);
    dv.setInt8(o++, p.disguiseAs);
    dv.setUint8(o++, q(p.caught, 100, 0, 255));
    dv.setUint8(o++, q(p.shield, 100, 0, 255));
    dv.setUint8(o++, q(p.slip, 100, 0, 255));
    dv.setUint8(o++, q(p.hitAge, 50, 0, 255));
    dv.setUint8(o++, clamp(p.score, 0, 255));
    dv.setUint8(o++, q(p.speed, 20, 0, 255));
  }
  dv.setUint8(o++, tn);
  for (const t of m.traps) {
    dv.setInt8(o++, t.owner);
    dv.setUint8(o++, q(t.warm, 100, 0, 255));
    dv.setUint8(o++, q(t.active, 50, 0, 255));
  }
  return new Uint8Array(buf);
}

export function decodeSnapshot(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let o = 1;
  const s = { tick: dv.getUint32(o) }; o += 4;
  s.remaining = dv.getUint16(o) / 10; o += 2;
  s.phase = PHASES[dv.getUint8(o++)] || 'play';
  s.countdown = dv.getUint8(o++) / 50;
  s.ack = dv.getUint32(o); o += 4;
  s.myTarget = dv.getInt8(o++);
  const n = dv.getUint8(o++);
  s.players = [];
  for (let i = 0; i < n; i++) {
    const p = { id: dv.getUint8(o++) };
    p.x = dv.getInt16(o) / 100; o += 2; p.z = dv.getInt16(o) / 100; o += 2;
    p.vx = dv.getInt16(o) / 100; o += 2; p.vz = dv.getInt16(o) / 100; o += 2;
    p.fx = dv.getInt8(o++) / 127; p.fz = dv.getInt8(o++) / 127;
    const f = dv.getUint8(o++);
    p.bot = !!(f & 4);
    p.dead = Math.max(dv.getUint8(o++) / 40, f & 1 ? .001 : 0);
    p.attackT = dv.getUint8(o++) / 200; p.dashT = dv.getUint8(o++) / 50; p.trapCD = dv.getUint8(o++) / 25;
    p.disguise = dv.getUint8(o++) / 20; p.disguiseCD = dv.getUint8(o++) / 8;
    p.disguiseHero = dv.getInt8(o++); p.disguiseAs = dv.getInt8(o++);
    p.caught = Math.max(dv.getUint8(o++) / 100, f & 2 ? .001 : 0);
    p.shield = Math.max(dv.getUint8(o++) / 100, f & 16 ? .001 : 0);
    p.slip = Math.max(dv.getUint8(o++) / 100, f & 8 ? .001 : 0);
    p.hitAge = dv.getUint8(o++) / 50; p.score = dv.getUint8(o++); p.speed = dv.getUint8(o++) / 20;
    s.players.push(p);
  }
  const tn = dv.getUint8(o++);
  s.traps = [];
  for (let i = 0; i < tn; i++) {
    s.traps.push({ id: i, owner: dv.getInt8(o++), warm: dv.getUint8(o++) / 100, active: dv.getUint8(o++) / 50 });
  }
  return s;
}

// inputs: [{ seq, mx, mz, buttons }] oldest → newest (contiguous seq)
export function encodeInputs(inputs) {
  const n = inputs.length, buf = new Uint8Array(6 + n * 3), dv = new DataView(buf.buffer);
  buf[0] = MSG.INPUT;
  dv.setUint32(1, n ? inputs[n - 1].seq >>> 0 : 0);
  buf[5] = n;
  for (let i = 0; i < n; i++) {
    dv.setInt8(6 + i * 3, q(inputs[i].mx, 127, -127, 127));
    dv.setInt8(7 + i * 3, q(inputs[i].mz, 127, -127, 127));
    buf[8 + i * 3] = inputs[i].buttons & 15;
  }
  return buf;
}
export function decodeInputs(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const latest = dv.getUint32(1), n = Math.min(bytes[5], Math.floor((bytes.length - 6) / 3)), out = [];
  for (let i = 0; i < n; i++) out.push({ seq: latest - (n - 1 - i), mx: dv.getInt8(6 + i * 3) / 127, mz: dv.getInt8(7 + i * 3) / 127, buttons: bytes[8 + i * 3] & 15 });
  return out;
}
