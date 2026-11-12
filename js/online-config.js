// Online play in the web / Microsoft Store version (the Steam version uses
// Steam lobbies and does not need any of this).
//
// PLAYFAB_TITLE_ID: PlayFab Game Manager → your game → ⚙ Title settings → Title ID
// (4–6 letters and digits, e.g. "1A2B3"). Empty = online play hidden.
export const PLAYFAB_TITLE_ID = '';

// Public STUN servers only tell each player its own public address so the
// browsers can connect directly; no game data passes through them.
export const ICE_SERVERS = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }];

// Local testing only: ?pftitle=TEST&pfbase=http://localhost:8790 (ignored on
// any other host, so the published game always talks to PlayFab).
export function playfabConfig(loc = globalThis.location) {
  const local = loc && /^(localhost|127\.0\.0\.1)$/.test(loc.hostname);
  const q = new URLSearchParams(loc?.search || '');
  const titleId = (local && q.get('pftitle')) || PLAYFAB_TITLE_ID;
  const base = local ? q.get('pfbase') : null;
  return titleId ? { titleId, base, iceServers: ICE_SERVERS } : null;
}
