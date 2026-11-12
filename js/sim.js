// Pure match simulation: no DOM, no Three.js. The host (and solo mode) runs it
// at a fixed 60 Hz; clients only use `integrate` to predict their own hero.
import { DT, RULES as R, ARENA as A, OBSTACLES, TRAPS, COUNTDOWN, DEFAULT_DURATION } from './config.js';
import { makeRng } from './rng.js';

export const BTN = { ATTACK: 1, DASH: 2, TRAP: 4, MASK: 8 };
export const NO_INPUT = Object.freeze({ mx: 0, mz: 0, buttons: 0 });

export function blocked(x, z, pad = 0) {
  for (const o of OBSTACLES) if (Math.abs(x - o.x) < o.w + pad && Math.abs(z - o.z) < o.d + pad) return true;
  return false;
}

// Movement shared by the simulation and client-side prediction.
export function integrate(p, mx, mz, dt, speed) {
  const len = Math.hypot(mx, mz);
  if (len > .05) { p.fx = mx / len; p.fz = mz / len; }
  const nx = p.x + (mx * speed + p.vx) * dt, nz = p.z + (mz * speed + p.vz) * dt;
  if (!blocked(nx, p.z)) p.x = nx; else p.vx *= -.15;
  if (!blocked(p.x, nz)) p.z = nz; else p.vz *= -.15;
  const k = Math.exp(-(p.slip > 0 ? R.iceFriction : R.friction) * dt);
  p.vx *= k; p.vz *= k;
  p.speed = len * speed;
}

export const outOfBounds = p => Math.abs(p.x) > A.edgeX || Math.abs(p.z) > A.edgeZ;

export function clampInside(p) {
  p.x = Math.max(-A.safeX, Math.min(A.safeX, p.x));
  p.z = Math.max(-A.safeZ, Math.min(A.safeZ, p.z));
  p.vx = 0; p.vz = 0;
}

const finite = v => (Number.isFinite(v) ? v : 0);

export function sanitizeInput(input) {
  if (!input) return NO_INPUT;
  let mx = finite(+input.mx), mz = finite(+input.mz);
  const len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }
  return { mx, mz, buttons: (input.buttons | 0) & 15 };
}

function makePlayer(r) {
  return {
    id: r.id, hero: r.hero, name: r.name || '', bot: !!r.bot,
    x: 999, z: 999, vx: 0, vz: 0, fx: 0, fz: 1, speed: 0,
    target: -1, score: 0, dead: 0, shield: 0, attackT: 0, dashT: 0, trapCD: 0,
    hitAge: 0, lastHit: -1, slip: 0, caught: 0, cageOwner: -1,
    disguise: 0, disguiseCD: 0, disguiseHero: -1, disguiseAs: -1,
    stats: { orders: 0, edgeOrders: 0, trapOrders: 0, deaths: 0, masksExpired: 0 }
  };
}

function emit(m, type, data) { m.events.push({ type, tick: m.tick, ...data }); }

// roster: [{ id: 0..n-1, hero: 0..7, name, bot }]
export function createMatch({ seed = 1, roster, duration = DEFAULT_DURATION, countdown = COUNTDOWN }) {
  if (!roster?.length) throw new Error('Roster is empty');
  const m = {
    seed, rng: makeRng(seed), tick: 0, time: 0, duration, remaining: duration,
    phase: countdown > 0 ? 'countdown' : 'play', countdown,
    players: [], traps: [], deck: [], respawnCount: 0, events: [], results: null
  };
  m.players = [...roster].sort((a, b) => a.id - b.id).map(makePlayer);
  m.players.forEach((p, i) => { if (p.id !== i) throw new Error('Player ids must be 0..n-1'); });
  m.traps = TRAPS.map((t, i) => ({ id: i, x: t.x, z: t.z, type: t.type, owner: -1, warm: 0, active: 0 }));
  m.players.forEach((p, i) => { freePos(m, p, i); p.shield = R.shield; });
  // One secret cycle: everybody hunts somebody, nobody hunts themselves.
  const order = m.players.map(p => p.id);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(m.rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  if (order.length > 1) m.players.forEach(p => { p.target = order[(order.indexOf(p.id) + 1) % order.length]; });
  return m;
}

export function freePos(m, p, i) {
  for (let attempt = 0; attempt < 140; attempt++) {
    const a = (i / 8) * Math.PI * 2 + attempt * .8;
    const r = attempt === 0 ? 5.6 : 3 + m.rng() * 6;
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (blocked(x, z, .3)) continue;
    if (attempt < 100) {
      if (m.players.some(q => q !== p && !q.dead && Math.hypot(q.x - x, q.z - z) < 1.6)) continue;
      if (m.traps.some(t => Math.hypot(t.x - x, t.z - z) < 1.9)) continue;
    }
    p.x = x; p.z = z; p.vx = 0; p.vz = 0;
    return;
  }
  p.x = 0; p.z = 0; p.vx = 0; p.vz = 0;
}

export function chooseTarget(m, p) {
  let id = -1;
  while (m.deck.length) {
    const card = m.deck.pop();
    if (card !== p.id && m.players[card] && !m.players[card].dead) { id = card; break; }
  }
  if (id < 0) {
    const pool = m.players.filter(q => q !== p && !q.dead);
    id = pool.length ? pool[Math.floor(m.rng() * pool.length)].id : -1;
  }
  if (id !== p.target) { p.target = id; emit(m, 'target', { p: p.id, target: id }); }
}

function clearDisguise(m, p, reason) {
  if (p.disguise <= 0 && p.disguiseHero < 0) return;
  p.disguise = 0; p.disguiseHero = -1; p.disguiseAs = -1;
  emit(m, 'unmask', { p: p.id, reason });
}

function attack(m, p) {
  if (p.attackT > 0) return;
  if (p.disguise > 0) clearDisguise(m, p, 'attack');
  p.attackT = R.attackCooldown;
  let hits = 0;
  for (const q of m.players) {
    if (q === p || q.dead || q.shield > 0 || q.caught > 0) continue;
    let dx = q.x - p.x, dz = q.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d >= R.attackRange) continue;
    if (d < 1e-4) { dx = p.fx; dz = p.fz; } else { dx /= d; dz /= d; }
    q.vx += dx * R.attackForce; q.vz += dz * R.attackForce;
    q.lastHit = p.id; q.hitAge = R.hitMemory; hits++;
    emit(m, 'hit', { p: q.id, by: p.id, x: q.x, z: q.z });
  }
  emit(m, 'attack', { p: p.id, x: p.x, z: p.z, hits });
}

function dash(m, p) {
  if (p.dashT > 0) return;
  p.dashT = R.dashCooldown;
  p.vx += p.fx * R.dashForce; p.vz += p.fz * R.dashForce;
  emit(m, 'dash', { p: p.id, x: p.x, z: p.z });
}

export function nearestIdleTrap(m, x, z, range = R.trapRange) {
  let best = null, bd = Infinity;
  for (const t of m.traps) {
    if (t.warm > 0 || t.active > 0) continue;
    const d = Math.hypot(x - t.x, z - t.z);
    if (d < range && d < bd) { bd = d; best = t; }
  }
  return best;
}

function armTrap(m, p) {
  if (p.trapCD > 0) return;
  const t = nearestIdleTrap(m, p.x, p.z);
  if (!t) { if (!p.bot) emit(m, 'trapNone', { p: p.id }); return; }
  if (p.disguise > 0) clearDisguise(m, p, 'trap');
  t.owner = p.id; t.warm = R.trapWarm; t.active = 0;
  p.trapCD = p.bot ? R.botTrapCooldown : R.trapCooldown;
  emit(m, 'trapArm', { p: p.id, trap: t.id });
}

function mask(m, p) {
  if (p.disguiseCD > 0 || p.disguise > 0) return;
  const options = m.players.filter(q => q !== p && !q.dead);
  if (!options.length) return;
  const copy = options[Math.floor(m.rng() * options.length)];
  p.disguise = R.maskTime; p.disguiseCD = R.maskCooldown;
  p.disguiseHero = copy.hero; p.disguiseAs = copy.id;
  emit(m, 'mask', { p: p.id, as: copy.id });
}

function hitTrap(m, p, t) {
  if (p.dead || p.shield > 0 || p.caught > 0) return;
  if (t.type === 'ice') {
    if (p.slip > 0) return;
    p.slip = R.iceSlip; p.vx = p.fx * R.iceForce; p.vz = p.fz * R.iceForce;
    p.lastHit = t.owner; p.hitAge = R.iceMemory;
    emit(m, 'slip', { p: p.id, trap: t.id });
    return;
  }
  if (t.type === 'cage') {
    p.caught = R.cageTime; p.cageOwner = t.owner; p.vx = 0; p.vz = 0;
    clearDisguise(m, p, 'cage');
    emit(m, 'caught', { p: p.id, trap: t.id, x: p.x, z: p.z });
    return;
  }
  if (t.type === 'spring') { emit(m, 'spring', { p: p.id, x: p.x, z: p.z }); eliminate(m, p, t.owner, 'spring'); return; }
  eliminate(m, p, t.owner, 'trap');
}

export function eliminate(m, v, attackerId, why) {
  if (v.dead > 0 || v.shield > 0) return;
  const x = v.x, z = v.z, vx = v.vx, vz = v.vz;
  v.caught = 0; v.cageOwner = -1;
  clearDisguise(m, v, 'elim');
  if (v.target >= 0) m.deck.push(v.target);
  v.dead = R.respawn; v.vx = 0; v.vz = 0; v.slip = 0; v.speed = 0; v.stats.deaths++;
  const a = attackerId >= 0 ? m.players[attackerId] : null;
  let scored = false;
  if (a && a !== v && a.target === v.id) {
    a.score++; scored = true; a.stats.orders++;
    if (why === 'edge') a.stats.edgeOrders++; else a.stats.trapOrders++;
    chooseTarget(m, a);
  }
  emit(m, 'elim', { v: v.id, by: a ? a.id : -1, why, scored, x, z, vx, vz });
  if (scored) emit(m, 'order', { p: a.id, v: v.id, why, score: a.score });
  // Private to the attacker: the victim was hunting them.
  if (a && a !== v && v.target === a.id) emit(m, 'turned', { p: a.id, v: v.id, scored });
  for (const p of m.players) if (p !== a && p.target === v.id) chooseTarget(m, p);
}

function respawn(m, p) {
  freePos(m, p, ++m.respawnCount % 8);
  p.shield = R.shield; p.hitAge = 0; p.lastHit = -1; p.slip = 0; p.vx = 0; p.vz = 0;
  chooseTarget(m, p);
  emit(m, 'respawn', { p: p.id, x: p.x, z: p.z });
}

function updatePlayer(m, p, input) {
  const dt = DT;
  p.attackT = Math.max(0, p.attackT - dt);
  p.dashT = Math.max(0, p.dashT - dt);
  p.shield = Math.max(0, p.shield - dt);
  p.hitAge = Math.max(0, p.hitAge - dt);
  p.trapCD = Math.max(0, p.trapCD - dt);
  p.disguiseCD = Math.max(0, p.disguiseCD - dt);
  if (p.disguise > 0) {
    p.disguise = Math.max(0, p.disguise - dt);
    if (p.disguise <= 0) { p.stats.masksExpired++; clearDisguise(m, p, 'timeout'); }
  }
  if (p.dead > 0) {
    p.dead = Math.max(0, p.dead - dt);
    if (p.dead <= 0) respawn(m, p);
    p.speed = 0;
    return;
  }
  p.slip = Math.max(0, p.slip - dt);
  if (p.caught > 0) {
    p.caught = Math.max(0, p.caught - dt);
    if (p.caught <= 0) eliminate(m, p, p.cageOwner, 'cage');
    p.speed = 0;
    return;
  }
  const b = input.buttons | 0;
  if (b & BTN.ATTACK) attack(m, p);
  if (b & BTN.DASH) dash(m, p);
  if (b & BTN.TRAP) armTrap(m, p);
  if (b & BTN.MASK) mask(m, p);
  integrate(p, input.mx, input.mz, dt, p.bot ? R.speedBot : R.speedHuman);
  if (outOfBounds(p)) {
    if (p.shield > 0) clampInside(p);
    else { eliminate(m, p, p.hitAge > 0 ? p.lastHit : -1, 'edge'); return; }
  }
  for (const t of m.traps) {
    if (t.active > 0 && Math.abs(p.x - t.x) < R.trapHitHalf && Math.abs(p.z - t.z) < R.trapHitHalf) {
      hitTrap(m, p, t);
      if (p.dead > 0 || p.caught > 0) break;
    }
  }
}

// Soft personal space so heroes do not stand inside each other.
function separate(m) {
  const ps = m.players, r = R.personalSpace;
  for (let i = 0; i < ps.length; i++) {
    const a = ps[i];
    if (a.dead > 0 || a.caught > 0) continue;
    for (let j = i + 1; j < ps.length; j++) {
      const b = ps[j];
      if (b.dead > 0 || b.caught > 0) continue;
      let dx = b.x - a.x, dz = b.z - a.z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      let d = Math.sqrt(d2);
      if (d < 1e-4) { const ang = (a.id * 7 + b.id * 13) % 17; dx = Math.cos(ang); dz = Math.sin(ang); d = 1; }
      const push = ((r - d) * .25) / d, ox = dx * push, oz = dz * push;
      if (!blocked(a.x - ox, a.z - oz)) { a.x -= ox; a.z -= oz; }
      if (!blocked(b.x + ox, b.z + oz)) { b.x += ox; b.z += oz; }
    }
  }
}

// Bots: same behaviour as the original single-player game, but frame-rate
// independent (fixed tick) and with edge/trap safety that always applies.
export function botThink(m, p) {
  const input = { mx: 0, mz: 0, buttons: 0 };
  if (p.dead > 0 || p.caught > 0) return input;
  let target = p.target >= 0 ? m.players[p.target] : null;
  if (!target || target.dead > 0) { chooseTarget(m, p); target = p.target >= 0 ? m.players[p.target] : null; }
  let mx = 0, mz = 0;
  if (target && target.disguise > 0) {
    mx = Math.sin(m.remaining * .5 + p.id); mz = Math.cos(m.remaining * .5 + p.id);
    target = null;
  }
  if (target) {
    mx = target.x - p.x; mz = target.z - p.z;
    const dist = Math.hypot(mx, mz);
    if (dist < 2.05 && p.attackT <= 0 && m.rng() < .065) input.buttons |= BTN.ATTACK;
    if (dist > 7 && p.dashT <= 0 && m.rng() < .002) input.buttons |= BTN.DASH;
    for (const o of OBSTACLES) {
      const dx = p.x - o.x, dz = p.z - o.z;
      if (Math.abs(dx) < o.w + 1.3 && Math.abs(dz) < o.d + 1.3) {
        const l = Math.hypot(dx, dz) || 1;
        mx += (-dz / l) * 5; mz += (dx / l) * 5;
      }
    }
    for (const t of m.traps) {
      if (t.warm > 0 || t.active > 0) continue;
      const dT = Math.hypot(p.x - t.x, p.z - t.z);
      if (dT < 3.4 && p.trapCD <= 0 && Math.hypot(target.x - t.x, target.z - t.z) < 2.4 && m.rng() < .006) input.buttons |= BTN.TRAP;
    }
  }
  for (const t of m.traps) {
    const dx = p.x - t.x, dz = p.z - t.z, dT = Math.hypot(dx, dz);
    if ((t.warm > 0 || t.active > 0) && dT < 3 && dT > 1e-3) { mx += (dx / dT) * 14; mz += (dz / dT) * 14; }
  }
  if (Math.abs(p.x) > A.botX) mx -= Math.sign(p.x) * 10;
  if (Math.abs(p.z) > A.botZ) mz -= Math.sign(p.z) * 10;
  const l = Math.hypot(mx, mz);
  if (l > 1e-6) { input.mx = mx / l; input.mz = mz / l; }
  return input;
}

function finish(m) {
  m.phase = 'ended';
  const sorted = [...m.players].sort((a, b) => b.score - a.score || a.id - b.id);
  const top = sorted[0].score;
  const winners = sorted.filter(p => p.score === top).map(p => p.id);
  m.results = { ranking: sorted.map(p => ({ id: p.id, score: p.score })), winners, draw: winners.length > 1 };
  emit(m, 'end', { results: m.results });
}

// inputs: array indexed by player id (humans only). Each entry is one input
// { mx, mz, buttons } or an array of inputs: a networked player may be advanced
// by 0..2 sub-steps per tick so the host consumes exactly the client's input
// stream (this keeps client-side prediction exact).
export function stepMatch(m, inputs) {
  if (m.phase === 'ended') return m.events;
  m.tick++;
  if (m.phase === 'countdown') {
    const before = Math.ceil(m.countdown - 1e-9);
    m.countdown = m.countdown - DT > 1e-6 ? m.countdown - DT : 0;
    const after = Math.ceil(m.countdown - 1e-9);
    if (after !== before && after > 0) emit(m, 'count', { n: after });
    if (m.countdown <= 0) { m.phase = 'play'; emit(m, 'go', {}); }
    return m.events;
  }
  m.time += DT;
  m.remaining = m.remaining - DT > 1e-6 ? m.remaining - DT : 0;
  for (const t of m.traps) {
    if (t.warm > 0) {
      t.warm = Math.max(0, t.warm - DT);
      if (t.warm <= 0) { t.active = t.type === 'ice' ? R.iceActive : R.trapActive; emit(m, 'trapFire', { trap: t.id, owner: t.owner }); }
    } else if (t.active > 0) t.active = Math.max(0, t.active - DT);
  }
  for (const p of m.players) {
    if (p.bot) { updatePlayer(m, p, botThink(m, p)); continue; }
    const input = inputs?.[p.id];
    if (Array.isArray(input)) { for (const inp of input) updatePlayer(m, p, sanitizeInput(inp)); }
    else updatePlayer(m, p, sanitizeInput(input));
  }
  separate(m);
  for (const p of m.players) if (p.dead <= 0 && p.target < 0) chooseTarget(m, p);
  if (m.remaining <= 0) finish(m);
  return m.events;
}

export function drainEvents(m) { return m.events.splice(0, m.events.length); }

// Humans who leave are replaced by bots (and vice versa for late joiners).
export function setBot(m, id, bot, name) {
  const p = m.players[id];
  if (!p) return;
  p.bot = !!bot;
  if (name != null) p.name = name;
  if (bot) { p.disguise = 0; p.disguiseHero = -1; p.disguiseAs = -1; }
}
