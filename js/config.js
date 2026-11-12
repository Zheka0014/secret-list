// Shared constants. Everything the simulation needs lives here as plain data,
// so the same rules run on the host, in solo mode and in Node tests.

export const GAME_VERSION = '1.0.0';
export const PROTOCOL_VERSION = 1;

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
export const SNAPSHOT_EVERY = 3;          // host → clients, 20 Hz
export const INPUT_SEND_EVERY = 2;        // client → host, 30 Hz
export const INPUT_REDUNDANCY = 6;        // inputs repeated in every packet (loss tolerance)
export const INTERP_TICKS = 6;            // remote players are drawn 100 ms in the past

export const MAX_PLAYERS = 8;
export const MATCH_DURATIONS = [120, 180, 300];
export const DEFAULT_DURATION = 180;
export const COUNTDOWN = 3;

export const ARENA = {
  edgeX: 12.6, edgeZ: 11.6,   // beyond this you fall off the roof
  safeX: 11.5, safeZ: 10.5,   // shielded players are clamped here
  botX: 10.6, botZ: 9.5,      // bots steer back inside past this line
  halfW: 12, halfD: 11
};

export const RULES = {
  speedHuman: 5.2, speedBot: 3.4,
  respawn: 5, shield: 2,
  attackCooldown: 1.05, attackRange: 2.25, attackForce: 17, hitMemory: 3,
  dashCooldown: 4, dashForce: 13,
  trapCooldown: 6, botTrapCooldown: 2, trapRange: 3.5, trapWarm: .9, trapActive: 2, iceActive: 4, trapHitHalf: 1.2,
  maskTime: 10, maskCooldown: 25,
  cageTime: 2, iceSlip: 1.6, iceForce: 13, iceMemory: 4,
  friction: 3.3, iceFriction: .35,
  personalSpace: .95
};

// Axis-aligned collision boxes (centre + half extents including a margin).
// They mirror the props that world.js draws.
export const OBSTACLES = [
  { x: -8, z: -7, w: 2.92, d: 2.42 },      // Moon Ramen
  { x: 7.7, z: -7.5, w: 3.27, d: 2.42 },   // Neon Club
  { x: -9, z: 4, w: 2.32, d: 2.42 },       // Arcade
  { x: -3.15, z: -9.5, w: .645, d: .695 }, // arch posts
  { x: 3.15, z: -9.5, w: .645, d: .695 },
  { x: -5, z: 6, w: 1.17, d: 1.17 },       // trees
  { x: 8, z: 4.5, w: 1.17, d: 1.17 },
  { x: 3, z: -7.8, w: 1.17, d: 1.17 },
  { x: -2, z: 4.6, w: 1.37, d: 1.02 },     // utility pods
  { x: 5, z: 1, w: 1.37, d: 1.02 },
  { x: 2, z: -2, w: 1.37, d: 1.02 }
];

export const TRAPS = [
  { x: -5, z: -1, type: 'pulse' },
  { x: 6, z: 6, type: 'pulse' },
  { x: 2, z: 7.5, type: 'pulse' },
  { x: -2, z: -6, type: 'spring' },
  { x: 7, z: -2, type: 'cage' },
  { x: -3, z: 9, type: 'ice' }
];

export const TRAP_COLORS = { pulse: 0xffcf3d, spring: 0xffa83d, cage: 0xc798ff, ice: 0x67e9ff };

// Eight heroes cut from the approved illustration, re-packed with 24 px gutters
// (assets/heroes/heroes.png, 2048 × 1024) so mipmaps never bleed between them.
export const ATLAS = { width: 2048, height: 1024 };
export const HEROES = [
  { id: 'fox',      rect: [12, 12, 391, 509],   height: 3.65, color: 0x9961ff, symbol: '✦' },
  { id: 'bunny',    rect: [427, 12, 340, 506],  height: 3.60, color: 0xff507f, symbol: '♥' },
  { id: 'frog',     rect: [791, 12, 355, 432],  height: 3.10, color: 0x85d637, symbol: '♣' },
  { id: 'axolotl',  rect: [1170, 12, 429, 459], height: 3.30, color: 0x27c9e3, symbol: '◆' },
  { id: 'duck',     rect: [12, 545, 388, 458],  height: 3.30, color: 0xffb352, symbol: '★' },
  { id: 'kitten',   rect: [424, 545, 360, 458], height: 3.20, color: 0xece6e0, symbol: '✿' },
  { id: 'raccoon',  rect: [808, 545, 367, 458], height: 3.35, color: 0x8286bd, symbol: '☾' },
  { id: 'mushroom', rect: [1199, 545, 413, 458], height: 3.25, color: 0xcc8dd9, symbol: '✧' }
];

// Square face crop for portraits and avatars: centre x, centre y (fractions of
// the hero rect) and side (fraction of the rect width).
export const FACE = [
  [.48, .40, .72], [.54, .50, .74], [.50, .33, .80], [.56, .36, .66],
  [.50, .30, .74], [.50, .36, .76], [.50, .36, .74], [.55, .42, .66]
];

export const hex = c => '#' + c.toString(16).padStart(6, '0');
