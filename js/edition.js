// Which edition is running.
//   full — the Microsoft Store app (this site installed as an app in Edge on
//          Windows) and the Steam / desktop build;
//   demo — the site opened in a browser tab: one short match against bots per
//          day, no online play.
// This is a soft gate: everything runs in the browser, so it only keeps honest
// players honest. Buyers must never be locked out, so any sign of the Store app
// unlocks the full game and is remembered on this device.
export const STORE_URL = 'https://apps.microsoft.com/detail/9PK8V9FPZCB5';
export const DEMO_DURATION = 120;          // seconds
export const DEMO_MATCHES_PER_DAY = 1;
const FLAG_KEY = 'secret-list.edition';
const DEMO_KEY = 'secret-list.demo';

const read = (storage, key) => { try { return storage?.getItem(key) ?? null; } catch { return null; } };
const write = (storage, key, value) => { try { storage?.setItem(key, value); } catch { /* private mode */ } };

const INSTALLED_MODES = ['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay'];
export function installedDisplayMode(win = globalThis) {
  try { return INSTALLED_MODES.some(m => win.matchMedia?.(`(display-mode: ${m})`).matches); } catch { return false; }
}

export function detectEdition({ desktop = false, referrer = '', ua = '', installed = false, storage = null, override = null } = {}) {
  if (override === 'full' || override === 'demo') return override;   // local testing only
  if (desktop) return 'full';
  // Edge sends this referrer when the Store app is first started from the Store.
  const fromStore = String(referrer).startsWith('app-info://platform/microsoft-store');
  // The Store app always runs as an installed Edge web app on Windows.
  const storeApp = installed && /Windows/.test(ua) && /\bEdg\//.test(ua);
  if (fromStore || storeApp) { write(storage, FLAG_KEY, 'store'); return 'full'; }
  return read(storage, FLAG_KEY) === 'store' ? 'full' : 'demo';
}

const dayKey = d => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
export function demoStatus(storage, now = new Date()) {
  const day = dayKey(now);
  let saved = null;
  try { saved = JSON.parse(read(storage, DEMO_KEY)); } catch { saved = null; }
  const used = saved && saved.day === day ? Math.max(0, saved.used | 0) : 0;
  return { day, used, left: Math.max(0, DEMO_MATCHES_PER_DAY - used) };
}
export function useDemoMatch(storage, now = new Date()) {
  const s = demoStatus(storage, now);
  write(storage, DEMO_KEY, JSON.stringify({ day: s.day, used: s.used + 1 }));
  return demoStatus(storage, now);
}
