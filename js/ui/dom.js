import { HEROES, FACE, ATLAS } from '../config.js';
import { t } from '../i18n.js';

export const $ = id => document.getElementById(id);
export function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children) if (c != null) e.append(c);
  return e;
}

export const ATLAS_URL = new URL('../../assets/heroes/heroes.png', import.meta.url).href;

// Face crop as a CSS sprite that scales with the element.
export function faceStyle(hero) {
  const [x, y, w, h] = HEROES[hero].rect, [cx, cy, s] = FACE[hero];
  const side = s * w, L = x + cx * w - side / 2, T = y + cy * h - side / 2;
  return `background-image:url(${ATLAS_URL});background-size:${ATLAS.width / side * 100}% ${ATLAS.height / side * 100}%;background-position:${L / (ATLAS.width - side) * 100}% ${T / (ATLAS.height - side) * 100}%;background-color:#${HEROES[hero].color.toString(16).padStart(6, '0')}55`;
}

export const heroName = i => t(`hero.${HEROES[i].id}.name`);
export const heroDesc = i => t(`hero.${HEROES[i].id}.desc`);

// Display name for a player in the current language.
export function playerName(p, localId) {
  if (!p) return '';
  if (p.bot || !p.name) return heroName(p.hero);
  if (p.id === localId && p.name === '@you') return t('you');
  return p.name;
}

// ---- spatial navigation for gamepad / arrow keys --------------------------------
const FOCUSABLE = 'button:not([disabled]):not([tabindex="-1"]), input:not([disabled]), [data-nav]';
function visible(e) {
  if (!e.offsetParent && getComputedStyle(e).position !== 'fixed') return false;
  const r = e.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
}
export function focusables(root) { return [...root.querySelectorAll(FOCUSABLE)].filter(visible); }

export function navigate(root, dir) {
  const items = focusables(root);
  if (!items.length) return;
  const cur = document.activeElement;
  if (!items.includes(cur)) { items[0].focus(); return; }
  if (cur.type === 'range' && (dir === 'left' || dir === 'right')) {
    cur.value = +cur.value + (dir === 'right' ? 5 : -5);
    cur.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }
  const r = cur.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  let best = null, bestScore = Infinity;
  for (const e of items) {
    if (e === cur) continue;
    const b = e.getBoundingClientRect(), x = b.left + b.width / 2, y = b.top + b.height / 2;
    const dx = x - cx, dy = y - cy;
    const main = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy;
    const cross = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
    if (main <= 4) continue;
    const score = main + cross * 2.2;
    if (score < bestScore) { bestScore = score; best = e; }
  }
  if (best) { best.focus(); best.scrollIntoView?.({ block: 'nearest' }); return true; }
  return false;
}

export function focusFirst(root, selector) {
  const target = (selector && root.querySelector(selector)) || focusables(root)[0];
  target?.focus({ preventScroll: true });
}
