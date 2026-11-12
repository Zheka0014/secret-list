// In-match interface: contract card, scoreboard, timer, abilities, minimap,
// feed, toasts and overlays. Reads the view every frame, reacts to events.
import { HEROES, RULES, OBSTACLES, ARENA, FACE, TRAP_COLORS } from '../config.js';
import { t, escapeHtml } from '../i18n.js';
import { $, faceStyle, heroName, heroDesc, playerName } from './dom.js';
import { nearestIdleTrap } from '../sim.js';

export function createHud({ atlasImage, device }) {
  const portrait = $('portraitCanvas').getContext('2d');
  const mini = $('minimap').getContext('2d');
  let lastTarget = -2, lastTargetMasked = null, forceContract = false, deadShown = false, scoreSig = '', toastT = 0, orderT = 0, uiT = 0, countShown = null, goT = 0;
  const prevScores = [];
  const abilities = [
    { id: 'abPush', key: 'attackT', total: RULES.attackCooldown, label: 'ability.pushKey', pad: 'ability.pushPad' },
    { id: 'abTrap', key: 'trapCD', total: RULES.trapCooldown, label: 'ability.trapKey', pad: 'ability.trapPad' },
    { id: 'abMask', key: 'disguiseCD', total: RULES.maskCooldown, label: 'ability.maskKey', pad: 'ability.maskPad' },
    { id: 'abDash', key: 'dashT', total: RULES.dashCooldown, label: 'ability.dashKey', pad: 'ability.dashPad' }
  ].map(a => ({ ...a, btn: $(a.id), small: $(a.id + 'CD'), cd: $(a.id).querySelector('.cd'), was: 0 }));

  function toast(text, seconds = 2.7) {
    const e = $('toast');
    e.textContent = text; e.classList.add('show'); toastT = seconds;
  }
  function feed(html, mine) {
    const f = $('feed'), p = document.createElement('p');
    p.innerHTML = html; if (mine) p.className = 'me';
    f.prepend(p);
    while (f.children.length > 4) f.lastChild.remove();
  }

  function drawPortrait(hero, masked) {
    const c = portrait.canvas, w = c.width, h = c.height;
    portrait.clearRect(0, 0, w, h);
    if (hero < 0 || !atlasImage) return;
    const [x, y, rw, rh] = HEROES[hero].rect, [cx, cy, s] = FACE[hero];
    const side = Math.min(rw, s * rw * 1.5), sx = x + cx * rw - side / 2, sy = y + Math.max(0, cy * rh - side * .42);
    const sh = side * h / w;
    portrait.drawImage(atlasImage, sx, sy, side, sh, 0, 0, w, h);
  }

  function renderContract(view) {
    const target = view.myTarget >= 0 ? view.players[view.myTarget] : null;
    const masked = !!(target && target.disguise > 0);
    const key = view.myTarget;
    if (key === lastTarget && masked === lastTargetMasked && !forceContract) return;
    forceContract = false;
    const changed = key !== lastTarget && lastTarget !== -2;
    lastTarget = key; lastTargetMasked = masked;
    $('portrait').classList.toggle('masked', masked);
    if (target) {
      drawPortrait(target.hero, masked);
      $('targetSymbol').textContent = '';
      $('targetName').textContent = playerName(target, view.localId).toUpperCase();
      $('targetDesc').textContent = masked ? t('contract.masked') : heroDesc(target.hero);
      $('portrait').style.backgroundColor = '#' + HEROES[target.hero].color.toString(16).padStart(6, '0');
    } else {
      drawPortrait(-1);
      $('targetSymbol').textContent = '?';
      $('targetName').textContent = view.phase === 'countdown' ? t('contract.waiting') : t('contract.none');
      $('targetDesc').textContent = view.phase === 'countdown' ? t('contract.waitingDesc') : t('contract.noneDesc');
      $('portrait').style.backgroundColor = '#aea0d8';
    }
    if (changed && target) { const c = $('contractCard'); c.classList.remove('deal'); void c.offsetWidth; c.classList.add('deal'); }
  }

  function renderScores(view) {
    const sig = view.players.map(p => `${p.id}:${p.score}:${p.name}:${p.bot ? 1 : 0}`).join('|') + '|' + view.localId + '|' + document.documentElement.lang;
    if (sig === scoreSig) return;
    scoreSig = sig;
    const sorted = [...view.players].sort((a, b) => b.score - a.score || a.id - b.id);
    $('scores').innerHTML = sorted.map((p, i) => {
      const bump = prevScores[p.id] !== undefined && p.score > prevScores[p.id];
      return `<div class="score-row ${p.id === view.localId ? 'me' : ''} ${bump ? 'bump' : ''}"><span class="rank">${i + 1}</span><span class="avatar" style="${faceStyle(p.hero)}"></span><span class="nm">${escapeHtml(p.id === view.localId && p.name === '@you' ? t('you') : playerName(p, view.localId))}${p.bot && view.mode !== 'solo' ? `<i>${t('scores.bot')}</i>` : ''}</span><strong class="score">${p.score}</strong></div>`;
    }).join('');
    view.players.forEach(p => { prevScores[p.id] = p.score; });
  }

  function drawMinimap(view) {
    const W = mini.canvas.width, H = mini.canvas.height, sx = (W - 16) / (ARENA.edgeX * 2), sz = (H - 16) / (ARENA.edgeZ * 2);
    const X = x => W / 2 + x * sx, Z = z => H / 2 + z * sz;
    mini.clearRect(0, 0, W, H);
    mini.fillStyle = '#4a3f6e'; mini.fillRect(X(-ARENA.edgeX), Z(-ARENA.edgeZ), ARENA.edgeX * 2 * sx, ARENA.edgeZ * 2 * sz);
    mini.strokeStyle = '#ff6ab8'; mini.lineWidth = 2; mini.strokeRect(X(-ARENA.edgeX), Z(-ARENA.edgeZ), ARENA.edgeX * 2 * sx, ARENA.edgeZ * 2 * sz);
    mini.fillStyle = '#8f7fb0';
    for (const o of OBSTACLES) mini.fillRect(X(o.x - o.w + .42), Z(o.z - o.d + .42), (o.w - .42) * 2 * sx, (o.d - .42) * 2 * sz);
    for (const tr of view.traps) {
      mini.fillStyle = tr.active > 0 ? '#ff7595' : tr.warm > 0 ? '#ffe066' : '#' + TRAP_COLORS[tr.type].toString(16).padStart(6, '0');
      mini.globalAlpha = tr.active > 0 || tr.warm > 0 ? 1 : .6;
      mini.fillRect(X(tr.x) - 5, Z(tr.z) - 5, 10, 10);
    }
    mini.globalAlpha = 1;
    for (const p of view.players) {
      if (p.dead > 0 || p.hidden > 0) continue;
      const me = p.id === view.localId, target = p.id === view.myTarget && !(p.disguise > 0);
      mini.beginPath(); mini.arc(X(p.x), Z(p.z), me ? 6 : target ? 5.5 : 4, 0, Math.PI * 2);
      mini.fillStyle = me ? '#ffffff' : target ? '#ff5c7a' : '#b0a0cf'; mini.fill();
      if (me || target) { mini.lineWidth = 2; mini.strokeStyle = '#221a3d'; mini.stroke(); }
    }
  }

  function renderAbilities(me, pad) {
    for (const a of abilities) {
      const v = me ? me[a.key] || 0 : 0, blocked = !me || me.dead > 0 || me.caught > 0;
      a.cd.style.transform = `scaleX(${Math.min(1, v / a.total)})`;
      a.btn.classList.toggle('cooling', v > 0 || blocked);
      a.small.textContent = v > 0 ? t('ability.seconds', { n: v.toFixed(1) }) : t(pad ? a.pad : a.label);
      if (a.was > 0 && v <= 0) { a.btn.classList.remove('ready-flash'); void a.btn.offsetWidth; a.btn.classList.add('ready-flash'); }
      a.was = v;
    }
  }

  return {
    toast,
    reset() {
      lastTarget = -2; lastTargetMasked = null; scoreSig = ''; prevScores.length = 0; countShown = null; goT = 0;
      $('feed').innerHTML = ''; $('orderPop').hidden = true; $('countdown').hidden = true; $('respawnOverlay').hidden = true;
      $('toast').classList.remove('show');
    },
    refresh() { forceContract = true; scoreSig = ''; },
    update(view, dt, { pad = false } = {}) {
      if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').classList.remove('show'); }
      if (orderT > 0) { orderT -= dt; if (orderT <= 0) $('orderPop').hidden = true; }
      if (!view?.players?.length) return;
      const me = view.localId >= 0 ? view.players[view.localId] : null;
      // countdown overlay
      const cd = $('countdown');
      if (view.phase === 'countdown') {
        const n = Math.max(1, Math.ceil(view.countdown - 1e-3));
        if (n !== countShown) { countShown = n; cd.hidden = false; cd.textContent = n; cd.className = ''; void cd.offsetWidth; cd.className = 'tick'; }
      } else if (countShown !== null && countShown !== 'go') { countShown = 'go'; goT = .9; cd.hidden = false; cd.textContent = t('countdown.go'); cd.className = ''; void cd.offsetWidth; cd.className = 'tick go'; }
      if (goT > 0) { goT -= dt; if (goT <= 0) cd.hidden = true; }
      uiT -= dt;
      renderContract(view);
      if (uiT > 0) return;
      uiT = .1;
      const r = Math.max(0, view.remaining);
      $('time').textContent = String(Math.floor(r / 60)).padStart(2, '0') + ':' + String(Math.floor(r % 60)).padStart(2, '0');
      $('timebar').style.width = (r / (view.duration || 180) * 100) + '%';
      document.querySelector('.timer').classList.toggle('hurry', view.phase === 'play' && r < 30);
      renderScores(view);
      renderAbilities(me, pad);
      drawMinimap(view);
      $('spectateBanner').hidden = !(view.localId < 0 && view.phase !== 'ended');
      const ro = $('respawnOverlay');
      if (me && me.dead > 0 && view.phase === 'play') { ro.hidden = false; $('respawnNum').textContent = Math.ceil(me.dead); $('targetDesc').textContent = t('contract.respawn', { n: Math.ceil(me.dead) }); deadShown = true; }
      else { ro.hidden = true; if (deadShown) { deadShown = false; forceContract = true; } }
      const ms = $('maskStatus');
      if (me && me.disguise > 0) { ms.hidden = false; ms.textContent = t('mask.status', { n: Math.ceil(me.disguise) }); } else ms.hidden = true;
      const near = me && !(me.dead > 0) && view.phase === 'play' ? nearestIdleTrap({ traps: view.traps }, me.x, me.z) : null;
      const nt = $('nearTrap');
      if (near && !(me.trapCD > 0)) { nt.hidden = false; nt.textContent = `${t(pad ? 'near.pad' : 'near.key')} · ${t('trap.' + near.type)} · ${t('trapEffect.' + near.type)}`; } else nt.hidden = true;
    },
    // Gameplay events that concern the local player (and the kill feed).
    event(e, view) {
      const me = view.localId, P = id => view.players[id], name = id => playerName(P(id), me);
      switch (e.type) {
        case 'go': { const tg = P(view.myTarget); if (tg && me >= 0) toast(t('toast.start', { name: name(view.myTarget) })); break; }
        case 'elim': {
          const why = t('why.' + e.why);
          if (e.scored) feed(t('feed.order', { a: escapeHtml(e.by === me ? t('you') : name(e.by)), why }), e.by === me);
          else feed(t('feed.out', { v: escapeHtml(e.v === me ? t('you') : name(e.v)), why }), e.v === me);
          if (e.v === me) toast(t('toast.eliminated'));
          else if (e.v === view.myTarget && e.by !== me && me >= 0) toast(t('toast.targetLost'));
          break;
        }
        case 'order':
          if (e.p === me) {
            toast(t('toast.order'));
            orderT = 2.5; const pop = $('orderPop'); pop.hidden = false; pop.classList.remove('celebrate'); void pop.offsetWidth; pop.classList.add('celebrate');
            setTimeout(() => { const tg = P(view.myTarget); $('orderNext').textContent = tg ? t('order.next', { name: name(view.myTarget) }) : t('order.nextNone'); }, 30);
          }
          break;
        case 'respawn': if (e.p === me) toast(t('toast.respawn')); break;
        case 'trapNone': if (e.p === me) toast(t('toast.noTrap'), 1.6); break;
        case 'trapArm': if (e.p === me) toast(t('toast.trapArmed', { trap: t('trap.' + view.traps[e.trap].type) })); break;
        case 'mask': if (e.p === me) toast(t(view.mode === 'solo' ? 'toast.mask' : 'toast.maskOnline', { name: name(e.as) })); break;
        case 'unmask': if (e.p === me && e.reason !== 'elim') toast(t('toast.unmask'), 1.8); break;
        case 'slip': if (e.p === me) toast(t('toast.slip')); break;
        case 'caught': if (e.p === me) toast(t('toast.caught')); break;
        case 'turned': if (e.p === me && !e.scored) toast(t('toast.turned')); break;
      }
    }
  };
}
