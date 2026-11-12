// Keyboard, mouse, touch and gamepad. Gameplay reads a movement vector and an
// edge-triggered button mask; menus get spatial navigation from the D-pad,
// stick and arrow keys.
import { BTN } from './sim.js';

const PHYSICAL = { KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd', KeyE: 'e', KeyQ: 'q', KeyR: 'r', Space: ' ', ShiftLeft: 'shift', ShiftRight: 'shift', ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Escape: 'escape', Enter: 'enter', NumpadEnter: 'enter', Tab: 'tab', F11: 'f11', Backquote: 'backquote' };
const LAYOUT = { ц: 'w', ф: 'a', ы: 's', в: 'd', у: 'e', й: 'q', к: 'r', arrowup: 'up', arrowdown: 'down', arrowleft: 'left', arrowright: 'right' };
const keyOf = e => PHYSICAL[e.code] || LAYOUT[e.key?.toLowerCase()] || e.key?.toLowerCase();
const MOVE_KEYS = { w: 'w', up: 'w', s: 's', down: 's', a: 'a', left: 'a', d: 'd', right: 'd' };

export function createInput({ canvas, handlers }) {
  const held = new Set();          // logical move keys: w a s d
  const tap = new Map();           // short taps keep moving for a moment
  const pressedAt = new Map();
  let buttons = 0;                 // pending edge-triggered actions
  let mode = 'menu';               // 'menu' | 'game'
  let lastDevice = 'kbm';
  const camera = { rotate: 0, zoom: 0 };
  const pad = { index: -1, prev: [], stickX: 0, stickY: 0, lookX: 0, navCooldown: 0, lastDir: '' };
  const listeners = new Set();
  const emitDevice = d => { if (d !== lastDevice) { lastDevice = d; handlers.device?.(d); } };

  function press(action) { buttons |= action; }

  addEventListener('keydown', e => {
    const k = keyOf(e);
    if (e.ctrlKey || e.metaKey || e.altKey) { if (k === 'enter' && e.altKey) { e.preventDefault(); handlers.fullscreen?.(); } return; }
    emitDevice('kbm');
    if (k === 'f11') { e.preventDefault(); handlers.fullscreen?.(); return; }
    if (k === 'escape') { e.preventDefault(); if (!e.repeat) handlers.back?.(); return; }
    if (k === 'backquote' && !e.repeat) { handlers.debug?.(); return; }
    const typing = e.target?.matches?.('input[type=text], input:not([type]), textarea');
    if (mode === 'menu') {
      if (typing) return;
      const dir = { up: 'up', down: 'down', left: 'left', right: 'right', w: 'up', s: 'down', a: 'left', d: 'right' }[k];
      if (dir) { e.preventDefault(); handlers.navigate?.(dir); }
      return;
    }
    if (typing) return;
    const move = MOVE_KEYS[k];
    if (move || [' ', 'shift', 'e', 'q', 'r', 'tab'].includes(k)) e.preventDefault();
    if (e.repeat) return;
    if (move) { held.add(move); pressedAt.set(move, performance.now()); return; }
    if (k === ' ') press(BTN.ATTACK);
    else if (k === 'shift') press(BTN.DASH);
    else if (k === 'e') press(BTN.TRAP);
    else if (k === 'q') press(BTN.MASK);
    else if (k === 'r') handlers.overview?.();
    else if (k === 'tab') handlers.scores?.(true);
  });
  addEventListener('keyup', e => {
    const k = keyOf(e);
    if (k === 'tab') handlers.scores?.(false);
    const move = MOVE_KEYS[k];
    if (!move) return;
    held.delete(move);
    const since = pressedAt.get(move);
    if (mode === 'game' && since !== undefined && performance.now() - since < 160) tap.set(move, .14);
    pressedAt.delete(move);
  });
  const clearAll = () => { held.clear(); tap.clear(); pressedAt.clear(); buttons = 0; };
  addEventListener('blur', clearAll);

  // Mouse: drag rotates the camera, wheel zooms.
  let dragging = false, lastX = 0;
  canvas.addEventListener('pointerdown', e => {
    if (mode !== 'game') return;
    if (e.pointerType === 'mouse') emitDevice('kbm'); else emitDevice('touch');
    dragging = true; lastX = e.clientX;
    canvas.setPointerCapture(e.pointerId);
    canvas.focus({ preventScroll: true });
  });
  canvas.addEventListener('pointermove', e => { if (dragging) { camera.rotate -= (e.clientX - lastX) * .008; lastX = e.clientX; } });
  const endDrag = () => { dragging = false; };
  canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('wheel', e => { e.preventDefault(); camera.zoom += e.deltaY * .0007; }, { passive: false });
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  // Touch D-pad (hold or tap).
  function bindTouchPad(root) {
    root.querySelectorAll('[data-key]').forEach(b => {
      let downAt = 0;
      b.addEventListener('pointerdown', e => { if (mode !== 'game') return; e.preventDefault(); emitDevice('touch'); downAt = performance.now(); b.setPointerCapture(e.pointerId); held.add(b.dataset.key); b.classList.add('held'); });
      const up = () => { if (!b.classList.contains('held')) return; held.delete(b.dataset.key); b.classList.remove('held'); if (mode === 'game' && performance.now() - downAt < 180) tap.set(b.dataset.key, .24); };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
    });
  }

  // ---- gamepad ---------------------------------------------------------------
  addEventListener('gamepadconnected', e => { if (pad.index < 0) pad.index = e.gamepad.index; handlers.gamepad?.(true, e.gamepad.id); });
  addEventListener('gamepaddisconnected', e => { if (e.gamepad.index === pad.index) { pad.index = -1; pad.stickX = pad.stickY = pad.lookX = 0; handlers.gamepad?.(false); } });
  const dead = (v, dz = .2) => (Math.abs(v) < dz ? 0 : (v - Math.sign(v) * dz) / (1 - dz));

  function pollPad(dt) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = pad.index >= 0 ? pads[pad.index] : null;
    if (!gp) { for (const p of pads) if (p && p.connected) { gp = p; pad.index = p.index; break; } }
    if (!gp) return;
    const b = i => !!gp.buttons[i]?.pressed;
    const now = gp.buttons.map(x => !!x?.pressed);
    const edge = i => now[i] && !pad.prev[i];
    const lx = dead(gp.axes[0] || 0), ly = dead(gp.axes[1] || 0);
    const dpadX = (b(15) ? 1 : 0) - (b(14) ? 1 : 0), dpadY = (b(13) ? 1 : 0) - (b(12) ? 1 : 0);
    if (now.some(Boolean) || Math.abs(lx) + Math.abs(ly) > 0) emitDevice('pad');
    if (mode === 'game') {
      pad.stickX = Math.max(-1, Math.min(1, lx + dpadX));
      pad.stickY = Math.max(-1, Math.min(1, ly + dpadY));
      pad.lookX = dead(gp.axes[2] || 0, .25);
      camera.rotate -= pad.lookX * dt * 2.4;
      const lt = gp.buttons[6]?.value || 0, rt = gp.buttons[7]?.value || 0;
      camera.zoom += (lt - rt) * dt * .8;
      if (edge(0)) press(BTN.ATTACK);
      if (edge(1) || edge(5)) press(BTN.DASH);
      if (edge(2)) press(BTN.TRAP);
      if (edge(3)) press(BTN.MASK);
      if (edge(4) || edge(8) || edge(10)) handlers.overview?.();
      if (edge(9)) handlers.back?.();
    } else {
      pad.stickX = pad.stickY = 0;
      let dir = '';
      const x = lx + dpadX, y = ly + dpadY;
      if (Math.abs(x) > .5 || Math.abs(y) > .5) dir = Math.abs(x) > Math.abs(y) ? (x > 0 ? 'right' : 'left') : (y > 0 ? 'down' : 'up');
      pad.navCooldown -= dt;
      if (dir && (dir !== pad.lastDir || pad.navCooldown <= 0)) { handlers.navigate?.(dir); pad.navCooldown = dir === pad.lastDir ? .12 : .38; }
      pad.lastDir = dir;
      if (edge(0)) handlers.confirm?.();
      if (edge(1)) handlers.back?.();
      if (edge(9)) handlers.back?.();
      if (edge(4)) handlers.tab?.(-1);
      if (edge(5)) handlers.tab?.(1);
    }
    pad.prev = now;
  }

  return {
    bindTouchPad,
    get mode() { return mode; },
    setMode(m) { if (m !== mode) { mode = m; clearAll(); pad.stickX = pad.stickY = 0; } },
    get device() { return lastDevice; },
    get hasPad() { return pad.index >= 0; },
    press,
    update(dt) {
      for (const [k, left] of tap) { if (left <= dt) tap.delete(k); else tap.set(k, left - dt); }
      pollPad(dt);
    },
    // Screen-relative movement: x → right, y → forward (away from the camera).
    move() {
      let x = 0, y = 0;
      const on = k => held.has(k) || tap.has(k);
      if (on('d')) x += 1; if (on('a')) x -= 1; if (on('w')) y += 1; if (on('s')) y -= 1;
      const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
      x += pad.stickX; y -= pad.stickY;
      const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
      return { x, y };
    },
    takeButtons() { const b = buttons; buttons = 0; return b; },
    takeCamera() { const c = { rotate: camera.rotate, zoom: camera.zoom }; camera.rotate = 0; camera.zoom = 0; return c; },
    clear: clearAll
  };
}
