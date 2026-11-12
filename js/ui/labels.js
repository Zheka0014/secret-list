// Name tags above heroes. Positions come from the 3D camera; overlapping tags
// are stacked instead of drawn on top of each other.
import { HEROES } from '../config.js';
import { t } from '../i18n.js';
import { playerName } from './dom.js';

export function createLabels(container) {
  const nodes = [];
  const pt = { x: 0, y: 0, visible: false };
  const items = [];

  function node(i) {
    if (!nodes[i]) {
      const n = document.createElement('div');
      n.className = 'name-label';
      n.style.display = 'none';
      container.append(n);
      nodes[i] = { n, text: '', cls: '', w: 0, h: 0, shown: false };
    }
    return nodes[i];
  }
  function set(o, html, cls) {
    if (o.text !== html) { o.n.innerHTML = html; o.text = html; o.w = 0; }
    if (o.cls !== cls) { o.n.className = 'name-label ' + cls; o.cls = cls; o.w = 0; }
    if (!o.w) { o.w = o.n.offsetWidth; o.h = o.n.offsetHeight; }
  }
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  function update(view, stage, active) {
    items.length = 0;
    const players = view?.players || [];
    for (let i = 0; i < players.length; i++) {
      const p = players[i], o = node(i);
      const show = active && p && !(p.dead > 0) && !(p.hidden > 0);
      if (!show) { if (o.shown) { o.n.style.display = 'none'; o.shown = false; } continue; }
      const heroShown = p.disguiseHero >= 0 ? p.disguiseHero : p.hero;
      stage.project(p.x, HEROES[heroShown].height + .45, p.z, pt);
      if (!pt.visible) { if (o.shown) { o.n.style.display = 'none'; o.shown = false; } continue; }
      if (!o.shown) { o.n.style.display = 'flex'; o.shown = true; }
      const me = p.id === view.localId;
      let html, cls = '';
      if (me) { html = p.disguise > 0 ? t('mask.you') : t('label.you'); cls = p.disguise > 0 ? 'you masked' : 'you'; }
      else {
        const as = p.disguise > 0 && p.disguiseAs >= 0 ? players[p.disguiseAs] : null;
        const shown = as || p;
        html = esc(playerName(shown, view.localId));
        if (shown.bot && view.mode !== 'solo') html += `<i>${t('scores.bot')}</i>`;
        if (view.myTarget === p.id && !(p.disguise > 0)) cls = 'target';
      }
      set(o, html, cls);
      items.push({ o, x: pt.x - o.w / 2, y: pt.y - o.h, y0: pt.y - o.h, w: o.w, h: o.h, me });
    }
    // Stack overlapping tags (your own tag keeps its place).
    items.sort((a, b) => (b.me - a.me) || (b.y - a.y));
    for (let i = 1; i < items.length; i++) {
      const a = items[i];
      for (let pass = 0; pass < 3; pass++) {
        let moved = false;
        for (let j = 0; j < i; j++) {
          const b = items[j];
          if (a.x < b.x + b.w + 2 && a.x + a.w + 2 > b.x && a.y < b.y + b.h + 2 && a.y + a.h + 2 > b.y) { a.y = b.y - a.h - 3; moved = true; }
        }
        if (!moved) break;
      }
      // never drift far from the hero: past two rows, overlapping is the lesser evil
      a.y = Math.max(a.y, a.y0 - (a.h + 3) * 2);
    }
    for (const it of items) it.o.n.style.transform = `translate(${Math.round(it.x)}px,${Math.round(it.y)}px)`;
  }
  function hideAll() { for (const o of nodes) if (o?.shown) { o.n.style.display = 'none'; o.shown = false; } }
  function reset() { for (const o of nodes) if (o) { o.text = ''; o.cls = null; o.w = 0; } }
  return { update, hideAll, reset };
}
