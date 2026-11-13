// Big-screen mode for Microsoft Edge on Xbox (and any TV the player turns it on
// for): a larger interface for the sofa, a hint on how to give the controller
// to the game, and the B button kept inside the game instead of leaving the site.

// Edge on Xbox: "...; Xbox; Xbox Series X) ... Edg/…" or "...; Xbox; Xbox One) ...".
export function detectXbox(ua = '') {
  if (!/\bXbox\b/i.test(ua)) return null;
  return /Xbox One/i.test(ua) ? 'xbox-one' : 'xbox-series';
}

// The desktop layout is drawn for a monitor at arm's length. On a TV across the
// room it should look like a 1280×720 screen, so a 1080-line page is scaled ×1.4.
export function tvScale(height) {
  const h = Number(height) || 0;
  return Math.round(Math.max(1, Math.min(1.6, h / 760)) * 100) / 100;
}

// Default graphics for a console browser: the Xbox One GPU is far weaker.
export const xboxQuality = kind => (kind === 'xbox-one' ? 'low' : 'medium');

// While Edge on Xbox keeps the controller for itself ("browser controls"), the
// B button is the browser's Back. A spare history entry turns that Back into the
// game's own back action. `onBack()` returns false when there is nothing to go
// back to (main menu): the player stays in the game either way.
export function guardBackButton(win, onBack) {
  const mark = { secretListGuard: true };
  try { win.history.pushState(mark, ''); } catch { return () => {}; }
  const handler = e => {
    if (e.state && e.state.secretListGuard) return;
    try { win.history.pushState(mark, ''); } catch { /* ignore */ }
    onBack();
  };
  win.addEventListener('popstate', handler);
  return () => win.removeEventListener('popstate', handler);
}
