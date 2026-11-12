const KEY = 'secret-list.settings.v1';
const DEFAULTS = { lang: null, volMaster: 80, volMusic: 45, volSfx: 90, quality: null, dynamic: true, fullscreen: true, shake: true, fps: false, name: '', hero: 0, duration: 180, bots: true, lastAddress: '' };

export function loadSettings() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { saved = {}; }
  return { ...DEFAULTS, ...saved };
}
export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode / storage disabled */ }
}
