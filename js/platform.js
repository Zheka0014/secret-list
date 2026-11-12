// Desktop (Electron) bridge. In a plain browser `native` is null and every
// helper degrades gracefully.
import { applyStatOps, popcount } from './achievements.js';
export const native = (typeof window !== 'undefined' && window.native) || null;
export const isDesktop = !!native;

let steamCache = null;
export async function steamStatus() {
  if (!native?.steam) return { available: false };
  if (!steamCache) {
    try { steamCache = await native.steam.status(); } catch { steamCache = { available: false }; }
  }
  return steamCache;
}

const unlocked = new Set();
export function achievement(id) {
  if (!native?.steam || unlocked.has(id)) return;
  unlocked.add(id);
  native.steam.achievement(id).catch?.(() => {});
}

// Adds to the player's stats in Steam and in a local copy (per Steam account).
// Returns the new totals — the larger of the two for each stat — so progress
// achievements still unlock if a stat was not created in Steamworks.
export async function updateStats(ops) {
  if (!ops?.length) return {};
  const key = 'secret-list.stats.v1.' + ((await steamStatus()).steamId || 'local');
  let local = {};
  try { local = JSON.parse(localStorage.getItem(key)) || {}; } catch { local = {}; }
  applyStatOps(local, ops);
  let remote = null;
  if (native?.steam?.stats) { try { remote = await native.steam.stats(ops); } catch { remote = null; } }
  const values = { ...local };
  for (const [k, v] of Object.entries(remote || {})) {
    if (!Number.isFinite(v)) continue;
    values[k] = k.endsWith('_MASK') ? ((values[k] | 0) | v) >>> 0 : Math.max(values[k] | 0, v);
  }
  for (const o of ops) if (o.count) values[o.count] = Math.max(values[o.count] | 0, popcount(values[o.name] | 0));
  try { localStorage.setItem(key, JSON.stringify(values)); } catch { /* storage may be unavailable */ }
  return values;
}

export function presence(state, extra = {}) {
  if (!native?.steam) return;
  try { native.steam.presence({ state, ...extra }); } catch { /* optional */ }
}

export async function setFullscreen(on) {
  if (native) return native.setFullscreen(!!on);
  try {
    if (on && !document.fullscreenElement) await document.documentElement.requestFullscreen();
    if (!on && document.fullscreenElement) await document.exitFullscreen();
  } catch { /* the browser may refuse without a gesture */ }
  return !!document.fullscreenElement;
}
export async function isFullscreen() { return native ? native.isFullscreen() : !!document.fullscreenElement; }

export function quit() { if (native) native.quit(); }

export async function lanHost(port) { return native?.lan ? native.lan.host(port) : { ok: false, error: 'unsupported' }; }
export async function lanStop() { return native?.lan ? native.lan.stop() : null; }

export function relayUrlFor(address) {
  // "192.168.1.5", "192.168.1.5:7777", "ws://host:port/relay"
  const a = String(address || '').trim();
  if (/^wss?:\/\//i.test(a)) return a;
  const [host, port] = a.includes(']') ? [a, ''] : a.split(':');
  return `ws://${host}:${port || 7777}/relay`;
}

// Same-origin relay when the web build is served by `npm run web`.
export function webRelayUrl() {
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return null;
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/relay`;
}
export async function webRelayAvailable() {
  if (isDesktop) return false;
  try { const r = await fetch('/relay-info', { cache: 'no-store' }); return r.ok && (await r.json()).relay === true; } catch { return false; }
}
