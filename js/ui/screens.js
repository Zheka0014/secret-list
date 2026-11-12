// Menus, lobby, settings and dialogs.
import { HEROES, MATCH_DURATIONS, GAME_VERSION } from '../config.js';
import { t, languages, getLang, escapeHtml } from '../i18n.js';
import { $, el, faceStyle, heroName, heroDesc, playerName, navigate, focusFirst } from './dom.js';

const SCREENS = ['loading', 'menu', 'online', 'lobby', 'settings'];

export function createScreens(app) {
  let current = 'loading', settingsBack = 'menu';
  const modal = $('modal');
  let modalOnClose = null;

  function show(name) {
    if (name !== 'lobby') lobbySig = '';
    current = name;
    for (const s of SCREENS) $('screen-' + s).classList.toggle('active', s === name);
    document.body.classList.remove('state-boot', 'state-menu', 'state-online', 'state-lobby', 'state-settings', 'state-play');
    document.body.classList.add('state-' + (name === 'none' ? 'play' : name));
    if (name !== 'none') setTimeout(() => { if (!modal.open) focusFirst($('screen-' + name), name === 'menu' ? '#btnSolo' : name === 'lobby' ? '#btnLobbyStart:not([disabled])' : null); }, 30);
  }

  // ---- hero pickers ------------------------------------------------------------
  function heroButtons(container, { selected, taken = new Map(), onPick }) {
    container.innerHTML = '';
    HEROES.forEach((h, i) => {
      const owner = taken.get(i);
      const b = el('button', { class: 'hero-btn' + (i === selected ? ' selected' : '') + (owner ? ' taken' : ''), style: faceStyle(i), 'aria-label': heroName(i), title: heroName(i), 'data-owner': owner || '', 'data-focus-key': 'hero-' + i });
      b.addEventListener('click', () => { if (!owner) onPick(i); });
      b.addEventListener('focus', () => app.sound('move'));
      container.append(b);
    });
  }
  function renderMenuHeroes() {
    const hero = app.settings.hero;
    heroButtons($('menuHeroes'), { selected: hero, onPick: i => { app.setHero(i); renderMenuHeroes(); app.sound('ui'); $('menuHeroes').children[i]?.focus(); } });
    $('menuHeroCaption').innerHTML = `<b>${escapeHtml(heroName(hero))}</b> · ${escapeHtml(heroDesc(hero))}`;
  }

  // ---- online --------------------------------------------------------------------
  function renderOnline(info) {
    const steamBox = $('boxSteam'), lanBox = $('boxLan');
    steamBox.classList.toggle('on', !!info.steam?.available);
    steamBox.classList.toggle('off', !info.steam?.available);
    $('steamStatus').textContent = info.steam?.available ? t('online.steamOn', { name: info.steam.name || '' }) : t('online.steamOff');
    $('btnSteamHost').disabled = !info.steam?.available;
    steamBox.hidden = !info.desktop;
    const web = (info.webRelay || info.playfab) && !info.desktop;
    lanBox.hidden = !(info.desktop || web);
    $('onlineUnavailable').hidden = info.desktop || web;
    $('btnLanHost').querySelector('span').textContent = t(web ? 'online.webCreate' : 'online.lanCreate');
    $('joinLabel').textContent = t(web ? 'online.code' : 'online.address');
    $('joinInput').placeholder = t(web ? 'online.codePh' : 'online.addressPh');
    $('lanHint').textContent = info.playfab && !info.desktop ? t('online.pfHint') : web ? t('online.webHint') : t('online.lanHint', { port: 7777 });
    $('boxLan').querySelector('h3').textContent = t(web ? 'online.friends' : 'online.lan');
    $('nameInput').value = app.settings.name || info.steam?.name || '';
    $('nameInput').placeholder = t('player');
    if (!$('joinInput').value) $('joinInput').value = web ? '' : (app.settings.lastAddress || '');
  }

  // ---- lobby -----------------------------------------------------------------------
  let lobbySig = '';
  function renderLobby(ls, extra = {}) {
    // Re-rendering destroys focused buttons (gamepad!), so skip it unless
    // something visible changed; pings are patched in place.
    const sig = JSON.stringify([ls.roster.map(r => [r.name, r.hero, r.host, r.you]), ls.settings, ls.state, ls.canStart, ls.isHost, ls.kind, extra.code, extra.addr, getLang()]);
    if (sig === lobbySig && current === 'lobby') {
      ls.roster.forEach((r, i) => { const e = $('lobbySlots').children[i]?.querySelector('.ping'); if (e && r.ping) e.textContent = t('lobby.ping', { n: r.ping }); });
      return;
    }
    lobbySig = sig;
    const focusKey = document.activeElement?.dataset?.focusKey || (document.activeElement?.id && $('screen-lobby').contains(document.activeElement) ? '#' + document.activeElement.id : null);
    const isHost = ls.isHost;
    $('lobbyKind').textContent = ls.kind === 'steam' ? 'STEAM' : ls.kind === 'web' ? 'WEB' : 'LAN / IP';
    $('lobbySub').textContent = ls.state === 'connecting' ? t('online.connecting') : ls.kind === 'steam' ? t('lobby.steamSub') : extra.code ? t('lobby.codeSub', { code: extra.code }) : extra.addr ? t('lobby.lanSub', { addr: extra.addr }) : '';
    $('btnCopy').hidden = !(extra.code || extra.addr);
    $('btnInvite').hidden = ls.kind !== 'steam';
    const slots = $('lobbySlots');
    slots.innerHTML = '';
    for (let i = 0; i < 8; i++) {
      const r = ls.roster[i];
      if (r) {
        const li = el('li', { class: 'human' + (r.you ? ' you' : '') },
          el('span', { class: 'avatar', style: faceStyle(r.hero) }),
          el('span', { class: 'nm', text: r.name || t('player') }),
          r.host ? el('span', { class: 'tag host', text: t('lobby.host') }) : null,
          r.you ? el('span', { class: 'tag', text: t('lobby.you') }) : null,
          !r.host && r.ping ? el('span', { class: 'ping', text: t('lobby.ping', { n: r.ping }) }) : null);
        slots.append(li);
      } else {
        slots.append(el('li', { class: 'empty' }, el('span', { class: 'avatar' }), el('span', { class: 'nm', text: ls.settings.bots ? t('lobby.bot') : t('lobby.empty') })));
      }
    }
    const mine = ls.roster.find(r => r.you);
    const taken = new Map(ls.roster.filter(r => !r.you).map(r => [r.hero, r.name]));
    heroButtons($('lobbyHeroes'), { selected: mine?.hero ?? -1, taken, onPick: i => { app.pickHero(i); app.sound('ui'); } });
    $('lobbySettings').style.display = isHost ? '' : 'none';
    const seg = $('durationSeg'); seg.innerHTML = '';
    for (const d of MATCH_DURATIONS) seg.append(el('button', { 'aria-pressed': String(ls.settings.duration === d), 'data-focus-key': 'dur-' + d, text: t('lobby.minutes', { n: d / 60 }), onclick: () => { app.setMatchSettings({ duration: d }); app.sound('ui'); } }));
    $('botsToggle').setAttribute('aria-pressed', String(!!ls.settings.bots));
    $('botsToggle').textContent = '';
    const running = ls.state === 'match';
    $('btnLobbyStart').disabled = !isHost || !ls.canStart || running;
    $('lobbyStartText').textContent = ls.state === 'connecting' ? t('online.connecting') : isHost ? (running ? t('lobby.inMatch') : t('lobby.start')) : (running ? t('lobby.inMatch') : t('lobby.waitHost'));
    $('lobbyWarn').hidden = !isHost || ls.canStart;
    if (focusKey) {
      const target = focusKey.startsWith('#') ? $(focusKey.slice(1)) : $('screen-lobby').querySelector(`[data-focus-key="${focusKey}"]`);
      if (target && !target.disabled) target.focus({ preventScroll: true });
    }
  }

  // ---- settings --------------------------------------------------------------------
  function renderSettings() {
    const s = app.settings;
    const seg = (id, options, value, onPick) => {
      const box = $(id); box.innerHTML = '';
      for (const o of options) box.append(el('button', { 'aria-pressed': String(o.id === value), text: o.name, onclick: () => { onPick(o.id); app.sound('ui'); renderSettings(); $(id).querySelector('[aria-pressed="true"]')?.focus(); } }));
    };
    seg('langSeg', languages, getLang(), id => app.setLanguage(id));
    seg('qualitySeg', ['low', 'medium', 'high', 'ultra'].map(id => ({ id, name: t('settings.q.' + id) })), s.quality, id => app.setQuality(id));
    $('volMaster').value = s.volMaster; $('volMusic').value = s.volMusic; $('volSfx').value = s.volSfx;
    for (const [id, key] of [['dynToggle', 'dynamic'], ['fsToggle', 'fullscreen'], ['shakeToggle', 'shake'], ['fpsToggle', 'fps']]) $(id).setAttribute('aria-pressed', String(!!s[key]));
  }
  for (const [id, key] of [['volMaster', 'volMaster'], ['volMusic', 'volMusic'], ['volSfx', 'volSfx']]) $(id).addEventListener('input', e => app.setVolume(key, +e.target.value));
  for (const [id, key] of [['dynToggle', 'dynamic'], ['fsToggle', 'fullscreen'], ['shakeToggle', 'shake'], ['fpsToggle', 'fps']]) $(id).addEventListener('click', () => { app.toggleSetting(key); app.sound('ui'); renderSettings(); });

  // ---- modal -------------------------------------------------------------------------
  function openModal({ kicker = '', title = '', body = '', note = '', buttons = [], onClose = null, className = '' }) {
    if (modal.open) modal.close();
    $('modalKicker').textContent = kicker; $('modalKicker').hidden = !kicker;
    $('modalTitle').innerHTML = title; $('modalBody').innerHTML = body; $('modalNote').textContent = note;
    modal.className = className;
    const box = $('modalButtons'); box.innerHTML = '';
    for (const row of buttons) {
      const items = Array.isArray(row) ? row : [row];
      const wrap = items.length > 1 ? el('div', { class: 'row' }) : box;
      for (const b of items) {
        const btn = el('button', { class: b.style || 'primary', html: b.html || `<span>${b.text}</span>${b.icon ? `<span>${b.icon}</span>` : ''}` });
        btn.addEventListener('click', () => { app.sound(b.style === 'ghost' ? 'back' : 'ui'); if (!b.keep) closeModal(true); b.onClick?.(); });
        wrap.append(btn);
      }
      if (wrap !== box) box.append(wrap);
    }
    modalOnClose = onClose;
    modal.showModal();
    setTimeout(() => focusFirst(modal), 30);
  }
  function closeModal(silent) {
    if (!modal.open) return;
    modal.close();
    const fn = modalOnClose; modalOnClose = null;
    if (!silent) fn?.();
  }
  modal.addEventListener('cancel', e => { e.preventDefault(); closeModal(false); });

  function rulesModal(onClose) {
    openModal({ kicker: t('rules.kicker'), title: t('rules.title'), body: t('rules.body') + t('rules.keys'), buttons: [{ text: t('rules.close'), icon: '✓', onClick: onClose }], onClose });
  }
  function messageModal(text, onClose, title = t('msg.error')) {
    openModal({ title: `<em>${title}</em>`, body: `<p>${escapeHtml(text)}</p>`, buttons: [{ text: t('msg.ok'), onClick: onClose }], onClose });
  }
  function confirmModal(text, yes, onYes, onNo) {
    openModal({ body: `<p>${escapeHtml(text)}</p>`, buttons: [[{ text: t('msg.cancel'), style: 'ghost', onClick: onNo }, { text: yes, onClick: onYes }]], onClose: onNo });
  }
  function resultsModal({ results, view, isHost, online, onAgain, onLobby, onMenu }) {
    const me = view.localId, sorted = results.ranking.map(r => view.players[r.id]).filter(Boolean);
    const winner = results.draw ? null : view.players[results.winners[0]];
    const title = results.draw ? t('result.draw') : winner?.id === me ? t('result.win') : t('result.winner', { name: escapeHtml(playerName(winner, me).toUpperCase()) });
    const rows = results.ranking.map((r, i) => {
      const p = view.players[r.id];
      return `<div class="result-row ${r.id === me ? 'me' : ''}"><span>${i + 1}.</span><span class="avatar" style="${faceStyle(p.hero)}"></span><span class="nm">${escapeHtml(r.id === me ? t('you') : playerName(p, me))}</span><b>${r.score}</b></div>`;
    }).join('');
    const mine = me >= 0 ? `<p>${t('result.yours', { n: view.players[me]?.score ?? 0 })}</p>` : '';
    const buttons = [];
    if (isHost) buttons.push({ text: t('result.again'), icon: '↻', onClick: onAgain });
    if (online && isHost) buttons.push([{ text: t('result.lobby'), style: 'secondary', onClick: onLobby }, { text: online ? t('pause.leaveOnline') : t('result.menu'), style: 'ghost', onClick: onMenu }]);
    else if (online) buttons.push({ text: t('pause.leaveOnline'), style: 'ghost', onClick: onMenu });
    else buttons.push({ text: t('result.menu'), style: 'ghost', onClick: onMenu });
    openModal({ kicker: t('result.kicker'), title, body: mine + rows, note: isHost ? t('result.note') : t('result.waitHost'), buttons, onClose: () => {} });
    void sorted;
  }
  function pauseModal({ online, onResume, onSettings, onRules, onLeave, onRestart }) {
    const buttons = [{ text: t('pause.resume'), icon: '→', onClick: onResume }];
    buttons.push([{ text: t('pause.settings'), style: 'secondary', onClick: onSettings }, { text: t('pause.rules'), style: 'secondary', onClick: onRules }]);
    if (!online && onRestart) buttons.push({ text: t('pause.restart'), style: 'ghost', onClick: onRestart });
    buttons.push({ text: online ? t('pause.leaveOnline') : t('pause.leave'), style: 'ghost', onClick: onLeave });
    openModal({ kicker: t('pause.kicker'), title: online ? t('pause.titleOnline') : t('pause.title'), body: `<p>${online ? t('pause.bodyOnline') : t('pause.body')}</p>`, buttons, onClose: onResume });
  }

  // ---- wiring ------------------------------------------------------------------------
  $('btnSolo').onclick = () => { app.sound('ui'); app.startSolo(); };
  $('btnOnline').onclick = () => { app.sound('ui'); app.openOnline(); };
  $('btnSettings').onclick = () => { app.sound('ui'); openSettings('menu'); };
  $('btnRules').onclick = () => { app.sound('ui'); rulesModal(() => focusFirst($('screen-menu'), '#btnRules')); };
  $('btnQuit').onclick = () => { app.sound('ui'); confirmModal(t('msg.quit'), t('msg.quitYes'), () => app.quit(), () => focusFirst($('screen-menu'), '#btnQuit')); };
  $('btnOnlineBack').onclick = () => { app.sound('back'); show('menu'); };
  $('btnSteamHost').onclick = () => { app.sound('ui'); app.hostSteam(); };
  $('btnLanHost').onclick = () => { app.sound('ui'); app.hostLan(); };
  $('btnJoin').onclick = () => { app.sound('ui'); app.joinAddress($('joinInput').value.trim()); };
  $('joinInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('btnJoin').click(); });
  $('nameInput').addEventListener('change', e => app.setName(e.target.value.trim().slice(0, 18)));
  for (const id of ['nameInput', 'joinInput']) $(id).addEventListener('focus', () => app.showKeyboard?.($(id)));
  $('btnLobbyLeave').onclick = () => { app.sound('back'); app.leaveSession(); };
  $('btnLobbyStart').onclick = () => { app.sound('ui'); app.startMatch(); };
  $('btnInvite').onclick = () => { app.sound('ui'); app.invite(); };
  $('btnCopy').onclick = () => { app.copyAddress(); $('btnCopy').textContent = t('lobby.copied'); setTimeout(() => { $('btnCopy').textContent = t('lobby.copy'); }, 1500); };
  $('botsToggle').onclick = () => { app.setMatchSettings({ bots: $('botsToggle').getAttribute('aria-pressed') !== 'true' }); app.sound('ui'); };
  $('btnSettingsBack').onclick = () => { app.sound('back'); closeSettings(); };

  function openSettings(back) {
    settingsBack = back;
    renderSettings();
    show('settings');
  }
  function closeSettings() {
    if (settingsBack === 'pause') { show('none'); app.openPause(); }
    else show(settingsBack);
  }

  return {
    show, get current() { return current; },
    renderMenuHeroes, renderOnline, renderLobby, renderSettings, openSettings, closeSettings,
    openModal, closeModal, get modalOpen() { return modal.open; },
    rulesModal, messageModal, confirmModal, resultsModal, pauseModal,
    navigate(dir) {
      const root = modal.open ? modal : current === 'none' ? null : $('screen-' + current);
      if (root) { if (navigate(root, dir) !== false) app.sound('move'); }
    },
    confirm() {
      const a = document.activeElement;
      if (a && a !== document.body && (modal.open ? modal.contains(a) : $('screen-' + current)?.contains(a))) a.click();
      else { const root = modal.open ? modal : $('screen-' + current); if (root) focusFirst(root); }
    },
    back() {
      if (modal.open) { closeModal(false); return true; }
      if (current === 'settings') { app.sound('back'); closeSettings(); return true; }
      if (current === 'online') { app.sound('back'); show('menu'); return true; }
      if (current === 'lobby') { app.sound('back'); app.leaveSession(); return true; }
      return false;
    },
    version: GAME_VERSION
  };
}
