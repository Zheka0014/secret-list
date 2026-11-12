// Steam achievements and stats. The tracker only reads what the local player
// sees — the same event stream arrives in solo, on the host and on clients — so
// every achievement works in every mode. Steam calls live in platform.js and
// electron/steam.cjs; the full list with texts is in steam/achievements.md.
import { TICK_RATE } from './config.js';

// Bits of STAT_TRAP_TYPES_MASK. A pulse plate takes players out with why 'trap'.
export const TRAP_BITS = { trap: 1, spring: 2, cage: 4, ice: 8 };

// Stats to create in Steamworks (INT, set by client, increment only).
export const STATS = [
  'STAT_CONTRACTS', 'STAT_MATCHES', 'STAT_WINS', 'STAT_ONLINE_MATCHES',
  'STAT_HEROES_PLAYED', 'STAT_HEROES_PLAYED_MASK', 'STAT_HEROES_WON', 'STAT_HEROES_WON_MASK',
  'STAT_TRAP_TYPES', 'STAT_TRAP_TYPES_MASK'
];

// Achievements that unlock when a stat reaches a value. In Steamworks each one
// is linked to its stat, so Steam also shows a progress bar.
export const PROGRESS = [
  ['ACH_CONTRACTS_25', 'STAT_CONTRACTS', 25], ['ACH_CONTRACTS_100', 'STAT_CONTRACTS', 100], ['ACH_CONTRACTS_500', 'STAT_CONTRACTS', 500],
  ['ACH_MATCHES_10', 'STAT_MATCHES', 10], ['ACH_MATCHES_50', 'STAT_MATCHES', 50],
  ['ACH_WINS_10', 'STAT_WINS', 10], ['ACH_ONLINE_10', 'STAT_ONLINE_MATCHES', 10],
  ['ACH_MEET_CREW', 'STAT_HEROES_PLAYED', 8], ['ACH_ALL_HEROES', 'STAT_HEROES_WON', 8], ['ACH_ALL_TRAPS', 'STAT_TRAP_TYPES', 4]
].map(([id, stat, value]) => ({ id, stat, value }));

export const ACHIEVEMENTS = [
  // match
  'ACH_FIRST_ORDER', 'ACH_WIN_MATCH', 'ACH_FIVE_ORDERS', 'ACH_TRAP_ORDER', 'ACH_EDGE_ORDER', 'ACH_ONLINE_MATCH', 'ACH_ONLINE_WIN', 'ACH_NO_FALL', 'ACH_GHOST',
  // mastery
  'ACH_DOUBLE', 'ACH_SURPRISE', 'ACH_BUZZER', 'ACH_REVERSAL', 'ACH_STRIKE', 'ACH_COMEBACK', 'ACH_STREAK',
  // heroes and traps
  'ACH_MEET_CREW', 'ACH_ALL_HEROES', 'ACH_SPRING_ORDER', 'ACH_ICE_ORDER', 'ACH_CAGE_ORDER', 'ACH_ALL_TRAPS',
  // progress
  'ACH_CONTRACTS_25', 'ACH_CONTRACTS_100', 'ACH_CONTRACTS_500', 'ACH_MATCHES_10', 'ACH_MATCHES_50', 'ACH_WINS_10', 'ACH_ONLINE_10',
  // hidden
  'ACH_SELF_FALL', 'ACH_OWN_TRAP', 'ACH_TOURIST', 'ACH_POPULAR', 'ACH_WINDMILL'
];
export const HIDDEN = ['ACH_SELF_FALL', 'ACH_OWN_TRAP', 'ACH_TOURIST', 'ACH_POPULAR', 'ACH_WINDMILL'];

export const RULES = {
  double: 10,      // two contracts within this many seconds
  surprise: 3,     // contract this soon after a push broke your disguise
  buzzer: 3,       // contract in the last seconds of the match
  iceMemory: 4.5,  // a fall this soon after slipping on your ice counts as the ice
  streak: 4, popular: 8, windmill: 15, five: 5
};

export const popcount = v => { let n = 0; for (let x = v >>> 0; x; x &= x - 1) n++; return n; };

export function progressUnlocks(values) {
  return PROGRESS.filter(p => (values?.[p.stat] ?? 0) >= p.value).map(p => p.id);
}

export function createTracker({ clock = () => performance.now() / 1000 } = {}) {
  let s = null;
  // Match time of an event: simulation ticks when the host sent them, the
  // local clock for events predicted on this machine.
  const timeOf = e => (Number.isFinite(e.tick) ? e.tick / TICK_RATE : clock());

  function start({ me = -1, hero = -1, online = false, fromStart = false } = {}) {
    s = {
      me, hero, online: !!online, fromStart: !!fromStart,
      orders: 0, streak: 0, deaths: 0, eliminated: false,
      lastOrderAt: -Infinity, unmaskAttackAt: -Infinity,
      hitTick: new Map(), strike: new Map(), slip: new Map(), trapOwner: new Map(),
      misses: 0, halfScore: null, trapBits: 0, contracts: 0, ended: false
    };
  }

  // Every frame while the match is on screen (the halftime score).
  function update(view) {
    if (!s || s.me < 0 || !s.fromStart || s.halfScore !== null || view?.phase !== 'play') return;
    if (view.remaining <= view.duration / 2) s.halfScore = view.players?.[s.me]?.score ?? 0;
  }

  function event(e, view) {
    const out = [];
    if (!s || s.me < 0 || s.ended) return out;
    const me = s.me;
    switch (e.type) {
      case 'trapArm': s.trapOwner.set(e.trap, e.p); break;
      case 'trapFire': if (e.owner != null) s.trapOwner.set(e.trap, e.owner); break;
      case 'hit': if (e.by === me) { s.misses = 0; s.hitTick.set(e.p, e.tick ?? timeOf(e)); } break;
      case 'attack':
        if (e.p !== me) break;
        if (e.hits > 0) s.misses = 0;
        else if (e.hits === 0) { if (++s.misses >= RULES.windmill) out.push('ACH_WINDMILL'); }
        // Predicted on a client: whether it hit is only known a moment later,
        // so count the misses confirmed before this push.
        else { if (s.misses >= RULES.windmill) out.push('ACH_WINDMILL'); s.misses++; }
        break;
      case 'unmask':
        if (e.p !== me) break;
        if (e.reason === 'timeout') out.push('ACH_GHOST');
        if (e.reason === 'attack') s.unmaskAttackAt = timeOf(e);
        break;
      case 'slip':
        s.slip.set(e.p, { at: timeOf(e), trap: e.trap });
        if (e.p === me && s.trapOwner.get(e.trap) === me) out.push('ACH_OWN_TRAP');
        break;
      case 'caught': if (e.p === me && s.trapOwner.get(e.trap) === me) out.push('ACH_OWN_TRAP'); break;
      case 'turned': if (e.p === me) out.push('ACH_REVERSAL'); break;
      case 'elim':
        if (e.v === me) {
          s.deaths++; s.streak = 0; s.eliminated = true;
          if (e.why === 'edge' && e.by < 0) out.push('ACH_SELF_FALL');
          if (e.by === me) out.push('ACH_OWN_TRAP');
          if (s.deaths >= RULES.popular) out.push('ACH_POPULAR');
        } else if (e.by === me && e.why === 'edge' && s.hitTick.has(e.v)) {
          // Two players off the roof from the very same push.
          const push = s.hitTick.get(e.v), n = (s.strike.get(push) || 0) + 1;
          s.hitTick.delete(e.v); s.strike.set(push, n);
          if (n >= 2) out.push('ACH_STRIKE');
        }
        break;
      case 'order': {
        if (e.p !== me) break;
        const at = timeOf(e);
        s.orders++; s.streak++; s.contracts++;
        const slip = s.slip.get(e.v);
        const ice = e.why === 'edge' && !!slip && at - slip.at <= RULES.iceMemory && s.trapOwner.get(slip.trap) === me;
        out.push('ACH_FIRST_ORDER');
        out.push(e.why === 'edge' && !ice ? 'ACH_EDGE_ORDER' : 'ACH_TRAP_ORDER');
        if (ice) { out.push('ACH_ICE_ORDER'); s.trapBits |= TRAP_BITS.ice; }
        else if (e.why === 'spring') { out.push('ACH_SPRING_ORDER'); s.trapBits |= TRAP_BITS.spring; }
        else if (e.why === 'cage') { out.push('ACH_CAGE_ORDER'); s.trapBits |= TRAP_BITS.cage; }
        else if (e.why === 'trap') s.trapBits |= TRAP_BITS.trap;
        if (s.orders >= RULES.five) out.push('ACH_FIVE_ORDERS');
        if (s.streak >= RULES.streak) out.push('ACH_STREAK');
        if (at - s.lastOrderAt <= RULES.double) out.push('ACH_DOUBLE');
        s.lastOrderAt = at;
        if (e.why === 'edge' && !ice && at - s.unmaskAttackAt <= RULES.surprise) out.push('ACH_SURPRISE');
        if (view?.phase === 'play' && view.remaining <= RULES.buzzer) out.push('ACH_BUZZER');
        break;
      }
    }
    return out;
  }

  // Contracts and trap types not stored in Steam yet. Also called when the
  // player leaves in the middle of a match, so nothing earned is lost.
  function flush() {
    const ops = [];
    if (!s) return ops;
    if (s.contracts) { ops.push({ name: 'STAT_CONTRACTS', add: s.contracts }); s.contracts = 0; }
    if (s.trapBits) { ops.push({ name: 'STAT_TRAP_TYPES_MASK', or: s.trapBits, count: 'STAT_TRAP_TYPES' }); s.trapBits = 0; }
    return ops;
  }

  // Match over: one-off achievements plus the stat updates for Steam.
  function end(results, view) {
    const out = { unlock: [], stats: [] };
    if (!s || s.me < 0 || s.ended || !results) return out;
    const me = s.me, win = !results.draw && results.winners?.[0] === me;
    const humans = (view?.players || []).filter(p => !p.bot).length;
    const score = results.ranking?.find(r => r.id === me)?.score ?? view?.players?.[me]?.score ?? 0;
    const withFriends = s.online && humans > 1;
    if (win) out.unlock.push('ACH_WIN_MATCH');
    if (withFriends) { out.unlock.push('ACH_ONLINE_MATCH'); if (win) out.unlock.push('ACH_ONLINE_WIN'); }
    if (s.fromStart && !s.eliminated) out.unlock.push('ACH_NO_FALL');
    if (s.fromStart && score === 0) out.unlock.push('ACH_TOURIST');
    if (win && s.halfScore === 0) out.unlock.push('ACH_COMEBACK');
    out.stats = flush();
    out.stats.push({ name: 'STAT_MATCHES', add: 1 });
    if (win) out.stats.push({ name: 'STAT_WINS', add: 1 });
    if (withFriends) out.stats.push({ name: 'STAT_ONLINE_MATCHES', add: 1 });
    if (s.hero >= 0) {
      out.stats.push({ name: 'STAT_HEROES_PLAYED_MASK', or: 1 << s.hero, count: 'STAT_HEROES_PLAYED' });
      if (win) out.stats.push({ name: 'STAT_HEROES_WON_MASK', or: 1 << s.hero, count: 'STAT_HEROES_WON' });
    }
    s.ended = true;
    return out;
  }

  return { start, update, event, end, flush, get state() { return s; } };
}

// Applies stat operations to a plain { name: value } object: the local copy
// kept next to Steam's (so progress still counts if a stat is missing in
// Steamworks) and the tests.
export function applyStatOps(values, ops) {
  for (const o of ops || []) {
    if (!o?.name) continue;
    const cur = values[o.name] | 0;
    if (o.add) values[o.name] = cur + Math.max(0, o.add | 0);
    if (o.or) values[o.name] = (cur | o.or) >>> 0;
    if (o.count) values[o.count] = Math.max(values[o.count] | 0, popcount(values[o.name] | 0));
  }
  return values;
}
