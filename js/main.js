// Secret List — entry point. Boots assets, renderer and UI, then runs whichever
// session is active: solo (host without network), online host or online client.
import * as T from '../vendor/three.module.js';
import { HEROES, TRAPS, GAME_VERSION, MATCH_DURATIONS } from './config.js';
import { setLang, t, apply as applyI18n, detectLanguage, getLang } from './i18n.js';
import { loadSettings, saveSettings } from './settings.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import { createStage } from './render/stage.js';
import { createHud } from './ui/hud.js';
import { createLabels } from './ui/labels.js';
import { createScreens } from './ui/screens.js';
import { $, ATLAS_URL, playerName } from './ui/dom.js';
import { HostSession, ClientSession } from './net/session.js';
import { WsTransport, SteamTransport } from './net/transport.js';
import { PlayFabTransport, normalizeCode } from './net/playfab.js';
import { playfabConfig } from './online-config.js';
import * as platform from './platform.js';
import { createMatch, BTN } from './sim.js';
import { createTracker, progressUnlocks } from './achievements.js';

const params = new URLSearchParams(location.search);
const settings = loadSettings();
const save = () => saveSettings(settings);
const audio = createAudio();
let stage, hud, labels, input, screens, steam = { available: false };
let session = null, sessionInfo = {}, mode = 'boot', menuView = null, lastLobby = null, testMove = null;
const achievements = createTracker();
// Stat updates go to Steam; progress achievements unlock from the new totals.
async function commitStats(ops) {
  if (!ops?.length) return;
  try { for (const id of progressUnlocks(await platform.updateStats(ops))) platform.achievement(id); } catch (e) { console.warn('stats', e); }
}

function setProgress(p) { const b = $('loadBar'); if (b) b.style.width = Math.round(p * 100) + '%'; }
function fatal(text) {
  $('screen-loading').innerHTML = `<div class="loader"><span class="brand-icon big">✕</span><p style="max-width:460px;line-height:1.5;color:#ffd6de">${text}</p></div>`;
}

async function boot() {
  steam = await platform.steamStatus();
  const lang = params.get('lang') || settings.lang || detectLanguage(steam.available ? steam.language : null);
  setLang(lang); applyI18n();
  if (!settings.quality) settings.quality = params.get('quality') || (steam.deck ? 'medium' : matchMedia('(pointer: coarse)').matches ? 'medium' : 'high');
  audio.setVolumes({ master: settings.volMaster / 100, music: settings.volMusic / 100, sfx: settings.volSfx / 100 });
  document.body.classList.toggle('touch', matchMedia('(pointer: coarse)').matches);
  document.body.classList.toggle('deck', !!steam.deck);
  setProgress(.1);
  await Promise.race([document.fonts?.load("1000 24px 'Nunito Variable'").catch(() => {}), new Promise(r => setTimeout(r, 2500))]);
  setProgress(.25);
  let atlasImage;
  try {
    atlasImage = await new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = ATLAS_URL; });
  } catch { fatal(t('msg.assets')); return; }
  const heroTexture = new T.Texture(atlasImage);
  heroTexture.colorSpace = T.SRGBColorSpace; heroTexture.minFilter = T.LinearMipmapLinearFilter; heroTexture.magFilter = T.LinearFilter;
  heroTexture.generateMipmaps = true; heroTexture.needsUpdate = true;
  setProgress(.6);
  try {
    stage = await createStage($('scene'), { quality: params.get('quality') || settings.quality, heroTexture });
  } catch (e) { console.error(e); fatal(t('msg.webgl')); return; }
  stage.buildScene(TRAPS.map((tr, i) => ({ ...tr, id: i })));
  // A lost GPU context (driver reset, sleep) cannot be patched up reliably: reload.
  stage.canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); console.warn('WebGL context lost'); });
  stage.canvas.addEventListener('webglcontextrestored', () => location.reload());
  if (params.get('scale')) { const s = +params.get('scale'); stage.renderer.setPixelRatio(s); stage.setAdaptive(false); }
  stage.setAdaptive(settings.dynamic && !params.get('scale'));
  stage.resize();
  setProgress(.9);

  hud = createHud({ atlasImage });
  labels = createLabels($('labels'));
  input = createInput({ canvas: stage.canvas, handlers: {
    back: onBack, navigate: dir => screens.navigate(dir), confirm: () => screens.confirm(),
    overview: toggleOverview, fullscreen: () => app.toggleSetting('fullscreen'), debug: () => app.toggleSetting('fps'),
    device: d => { document.body.classList.toggle('pad', d === 'pad'); if (d === 'touch') document.body.classList.add('touch'); },
    gamepad: on => { if (on) document.body.classList.add('pad'); },
    scores: on => $('scoreboard').classList.toggle('expanded', on)
  } });
  input.bindTouchPad($('touch'));
  screens = createScreens(app);
  bindHud();
  menuView = makeMenuView();
  $('btnQuit').hidden = !platform.isDesktop;
  $('privacyRow').hidden = platform.isDesktop;
  // Offline play for the published web / Microsoft Store version.
  if ('serviceWorker' in navigator && !platform.isDesktop && (location.protocol === 'https:' || params.has('sw'))) {
    navigator.serviceWorker.register('sw.js').catch(e => console.warn('service worker', e));
  }
  updateSoundButton();
  // The desktop shell remembers the window mode itself; mirror it in the settings.
  if (platform.isDesktop) settings.fullscreen = !!(await platform.isFullscreen().catch(() => settings.fullscreen));
  setProgress(1);
  toMenu();
  requestAnimationFrame(frame);
  setInterval(backgroundTick, 50);
  document.addEventListener('visibilitychange', () => { if (document.hidden && session?.kind === 'solo' && mode === 'play' && !session.paused && session.state === 'match') openPause(); });
  // Steam: invites accepted while running, or a +connect_lobby launch argument.
  if (platform.native?.steam) {
    platform.native.steam.onJoinRequest?.(lobbyId => requestJoinSteam(lobbyId));
    const pending = await platform.native.steam.pendingJoin?.();
    if (pending) joinSteamLobby(pending);
  }
  if (params.get('autostart') === 'solo') app.startSolo();
  exposeTestApi();
}

// ---- menu attract scene ----------------------------------------------------------
function makeMenuView() {
  const m = createMatch({ seed: 12, roster: HEROES.map((h, i) => ({ id: i, hero: i, name: '', bot: true })), countdown: 0 });
  const arrange = () => {
    const others = m.players.filter(p => p.hero !== settings.hero);
    const sel = m.players.find(p => p.hero === settings.hero);
    sel.x = 0; sel.z = 3.4; sel.fx = 0; sel.fz = 1;
    others.forEach((p, i) => { const a = -1.15 + i * (2.3 / (others.length - 1)); p.x = Math.sin(a) * 6.2; p.z = 1.2 - Math.cos(a) * 4.8; });
    m.players.forEach(p => { p.shield = 0; p.dead = 0; });
  };
  arrange();
  return { mode: 'menu', localId: -1, players: m.players, traps: m.traps, myTarget: -1, phase: 'menu', arrange };
}

// ---- frame loop --------------------------------------------------------------------
let last = performance.now(), fpsT = 0, fpsN = 0, lastFrame = performance.now(), simLast = performance.now();
const localInput = { mx: 0, mz: 0, buttons: 0 };
function readLocalInput() {
  const mv = testMove || input.move();
  const R = stage.viewRight, F = stage.viewForward;
  localInput.mx = R.x * mv.x + F.x * mv.y; localInput.mz = R.z * mv.x + F.z * mv.y;
  localInput.buttons = input.mode === 'game' ? input.takeButtons() : 0;
}
// The match clock has its own timestamp so that frames and background ticks
// (below) never count the same stretch of time twice.
function stepSession(now) {
  const dt = Math.min(Math.max(0, (now - simLast) / 1000), .25);
  simLast = now;
  if (session) session.update(dt, localInput);
}
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, .1);
  last = now; lastFrame = performance.now();
  input.update(dt);
  const cam = input.takeCamera();
  stage.cam.angle += cam.rotate;
  stage.cam.zoom = Math.max(.72, Math.min(1.45, stage.cam.zoom + cam.zoom));
  readLocalInput();
  stepSession(lastFrame);
  if (mode === 'play' && session?.view) achievements.update(session.view);
  const view = session?.view?.players?.length ? session.view : menuView;
  const playing = mode === 'play' && view !== menuView;
  const running = playing ? !(session.paused) : true;
  stage.update(view, dt, { mode: playing ? 'play' : 'menu', running });
  labels.update(view, stage, playing);
  if (playing) hud.update(view, dt, { pad: input.device === 'pad' }); else hud.update(null, dt);
  if (playing && session.view.phase === 'play') audio.setIntensity(session.view.remaining < 30 ? 1 : 0);
  fpsN++; fpsT += dt;
  if (fpsT >= .5) { if (settings.fps) { const i = stage.info(); $('fps').textContent = `${Math.round(fpsN / fpsT)} FPS · ${i.calls} draws · ${(i.dynScale * 100) | 0}%`; } fpsN = 0; fpsT = 0; updateHeader(); }
}
// Keep an online host (and clients) ticking when requestAnimationFrame stalls:
// the window is hidden (no input then), or frames are simply very slow — a
// weak GPU or a long hitch — in which case keys held right now still count.
function backgroundTick() {
  if (!session || session.kind === 'solo') return;
  const now = performance.now();
  if (now - lastFrame < 120) return;
  if (document.hidden) { localInput.mx = localInput.mz = 0; localInput.buttons = 0; }
  else readLocalInput();
  stepSession(now);
}

// ---- header -----------------------------------------------------------------------
function updateHeader() {
  let phase = 'phase.menu';
  if (mode === 'lobby') phase = 'phase.lobby';
  if (mode === 'play' && session) phase = 'phase.' + (session.view.phase === 'countdown' ? 'countdown' : session.view.phase === 'ended' ? 'ended' : 'play');
  $('phase').textContent = t(phase);
  let text = t('mode.solo', { n: 8 });
  if (session && session.kind !== 'solo') {
    const players = session.view.players?.length ? session.view.players : null;
    const humans = players ? players.filter(p => !p.bot).length : (lastLobby?.roster.length || 1);
    const bots = players ? players.length - humans : 0;
    text = bots ? t('mode.online', { h: humans, b: bots }) : t('mode.onlineNoBots', { h: humans });
  }
  $('modeText').textContent = text;
}
function updateSoundButton() {
  const muted = settings.volMaster === 0 || settings.muted;
  $('btnSound').classList.toggle('muted', !!muted);
}

// ---- HUD buttons --------------------------------------------------------------------
function bindHud() {
  $('abPush').onclick = () => input.press(BTN.ATTACK);
  $('abDash').onclick = () => input.press(BTN.DASH);
  $('abTrap').onclick = () => input.press(BTN.TRAP);
  $('abMask').onclick = () => input.press(BTN.MASK);
  $('btnCamera').onclick = toggleOverview;
  $('btnPause').onclick = () => openPause();
  $('btnHelp').onclick = () => {
    audio.sfx.ui();
    if (mode === 'play') { pauseSolo(true); input.setMode('menu'); screens.rulesModal(() => resumeFromModal()); }
    else screens.rulesModal(() => {});
  };
  $('btnSound').onclick = () => { settings.muted = !settings.muted; audio.setVolumes({ master: settings.muted ? 0 : settings.volMaster / 100 }); updateSoundButton(); save(); audio.sfx.ui(); };
}
function toggleOverview() {
  if (mode !== 'play') return;
  stage.cam.overview = !stage.cam.overview;
  $('btnCamera').setAttribute('aria-pressed', String(stage.cam.overview));
  hud.toast(t(stage.cam.overview ? 'toast.overview' : 'toast.follow'), 1.6);
}

// ---- navigation ------------------------------------------------------------------------
function onBack() {
  if (screens.back()) return;
  if (mode === 'play') openPause();
}
function pauseSolo(p) { if (session?.kind === 'solo') session.setPaused(p); }
function openPause() {
  if (mode !== 'play' || !session) return;
  if (session.state === 'results' || session.view.results) return;
  input.setMode('menu');
  pauseSolo(true);
  audio.sfx.ui();
  screens.pauseModal({
    online: session.kind !== 'solo',
    onResume: resumeFromModal,
    onSettings: () => screens.openSettings('pause'),
    onRules: () => screens.rulesModal(() => openPause()),
    onLeave: () => app.leaveSession(),
    onRestart: session.kind === 'solo' ? () => app.startSolo() : null
  });
}
function resumeFromModal() {
  if (mode !== 'play') return;
  pauseSolo(false);
  input.setMode('game');
  screens.show('none');
  stage.canvas.focus({ preventScroll: true });
}

function toMenu() {
  mode = 'menu';
  input.setMode('menu');
  screens.closeModal(true);
  screens.renderMenuHeroes();
  menuView.arrange();
  stage.cam.overview = false; stage.cam.zoom = 1;
  screens.show('menu');
  audio.music('menu');
  platform.presence('menu');
  updateHeader();
}

// ---- sessions ---------------------------------------------------------------------------
function endSession() {
  if (!session) return;
  commitStats(achievements.flush());
  const s = session; session = null;
  try { s.leave(); } catch (e) { console.warn(e); }
  if (sessionInfo.lan) platform.lanStop();
  sessionInfo = {};
  lastLobby = null;
}
function bindSession(s) {
  s.on('lobby', ls => {
    if (s !== session) return;
    lastLobby = ls;
    updateHeader();
    if (mode !== 'lobby') return;
    screens.renderLobby(ls, sessionInfo);
    platform.presence('lobby', { group: sessionInfo.lobbyId, size: ls.roster.length });
  });
  s.on('match-start', d => { if (s === session) enterMatch(d); });
  s.on('events', list => { if (s === session) onEvents(list); });
  s.on('local-event', e => { if (s === session) onEvents([e]); });
  s.on('match-end', d => { if (s === session) onMatchEnd(d); });
  s.on('closed', d => { if (s === session) onSessionClosed(d.reason); });
  s.on('peer-joined', d => { if (s !== session) return; hud.toast(t('toast.joined', { name: d.name })); audio.sfx.join(); });
  s.on('peer-left', d => { if (s !== session) return; hud.toast(t(d.inMatch ? 'toast.left' : 'toast.leftLobby', { name: d.name })); audio.sfx.leave(); });
  s.on('back-to-lobby', () => { if (s !== session) return; toLobbyScreen(); });
  s.on('spectate', () => { if (s === session) hud.toast(t('toast.spectate'), 4); });
}
function toLobbyScreen() {
  mode = 'lobby';
  input.setMode('menu');
  screens.closeModal(true);
  screens.renderLobby(lastLobby || { kind: session?.kind || 'lan', isHost: false, state: 'connecting', settings: {}, roster: [], canStart: false }, sessionInfo);
  screens.show('lobby');
  audio.music('menu');
  updateHeader();
}
function enterMatch() {
  mode = 'play';
  screens.closeModal(true);
  screens.show('none');
  input.setMode('game');
  hud.reset(); labels.reset(); stage.resetMatchVisuals();
  stage.cam.overview = false; stage.cam.zoom = 1;
  $('btnCamera').setAttribute('aria-pressed', 'false');
  commitStats(achievements.flush());
  const v = session.view;
  achievements.start({ me: v.localId, hero: v.players[v.localId]?.hero ?? -1, online: session.kind !== 'solo', fromStart: v.phase === 'countdown' });
  audio.music('match');
  platform.presence('playing', { group: sessionInfo.lobbyId, size: session.view.players.filter(p => !p.bot).length });
  stage.canvas.focus({ preventScroll: true });
  updateHeader();
}
function onMatchEnd({ results }) {
  const view = session.view, me = view.localId;
  const win = me >= 0 && !results.draw && results.winners[0] === me;
  setTimeout(() => {
    if (!session || mode !== 'play') return;
    input.setMode('menu');
    audio.sfx.end(win);
    audio.music('menu');
    const online = session.kind !== 'solo';
    screens.resultsModal({
      results, view, isHost: session.isHost, online,
      onAgain: () => { if (session?.isHost) session.start(); },
      onLobby: () => { if (session?.isHost) { session.backToLobby(); toLobbyScreen(); } },
      onMenu: () => app.leaveSession()
    });
  }, 1400);
  const done = achievements.end(results, view);
  for (const id of done.unlock) platform.achievement(id);
  commitStats(done.stats);
}
function onSessionClosed(reason) {
  const text = reason === 'hostLeft' ? t('msg.hostLeft') : reason?.startsWith?.('version:') ? t('msg.version', { v: reason.slice(8) }) : reason === 'full' ? t('msg.full') : reason === 'kicked' ? t('msg.kicked') : t('msg.connectFail');
  const s = session; session = null;
  commitStats(achievements.flush());
  try { s?.leave(); } catch { /* already closed */ }
  if (sessionInfo.lan) platform.lanStop();
  sessionInfo = {};
  toMenu();
  screens.messageModal(text, () => screens.show('menu'));
}

// ---- events → effects, HUD, sound, achievements --------------------------------------
const pt = { x: 0, y: 0, visible: true };
function panOf(x, z) { stage.project(x, 1, z, pt); return Math.max(-1, Math.min(1, (pt.x / stage.canvas.clientWidth) * 2 - 1)) * .8; }
function near(view, x, z, r = 9) { const me = view.players[view.localId]; return !me || Math.hypot(me.x - x, me.z - z) < r; }
function onEvents(list) {
  const view = session.view, me = view.localId, sfx = audio.sfx;
  for (const e of list) {
    if (e.type === 'end') continue;
    if (!(settings.shake) && stage.cam.shake) stage.cam.shake = 0;
    stage.onEvent(e, view);
    if (!settings.shake) stage.cam.shake = 0;
    hud.event(e, view);
    for (const id of achievements.event(e, view)) platform.achievement(id);
    const p = e.p != null ? view.players[e.p] : null;
    const x = e.x ?? p?.x ?? 0, z = e.z ?? p?.z ?? 0;
    switch (e.type) {
      case 'attack': if (e.p === me || near(view, x, z, 7)) sfx.push(panOf(x, z)); break;
      case 'hit': if (e.p === me || e.by === me) sfx.hit(panOf(x, z)); break;
      case 'dash': if (e.p === me) sfx.dash(0); break;
      case 'trapArm': if (e.p === me || near(view, view.traps[e.trap].x, view.traps[e.trap].z, 8)) sfx.trapArm(panOf(view.traps[e.trap].x, view.traps[e.trap].z)); break;
      case 'trapFire': { const tr = view.traps[e.trap]; sfx.trapFire(tr.type, panOf(tr.x, tr.z)); break; }
      case 'elim': sfx.elim(panOf(e.x, e.z)); if (e.why === 'edge') sfx.fall(panOf(e.x, e.z)); if (e.v === me) sfx.lose(); break;
      case 'order': if (e.p === me) sfx.order(); break;
      case 'respawn': if (e.p === me) sfx.respawn(); break;
      case 'mask': if (e.p === me) sfx.mask(0); break;
      case 'unmask': if (e.p === me) sfx.unmask(0); break;
      case 'caught': sfx.caught(panOf(x, z)); break;
      case 'slip': sfx.slip(panOf(x, z)); break;
      case 'count': sfx.count(); break;
      case 'go': sfx.go(); break;
      case 'trapNone': if (e.p === me) sfx.back(); break;
    }
  }
}

// ---- app API used by the screens ----------------------------------------------------------
const localName = () => (settings.name || (steam.available ? steam.name : '') || t('player')).slice(0, 18);
const app = {
  settings,
  sound: name => audio.sfx[name]?.(),
  setHero(i) { settings.hero = i; save(); menuView.arrange(); },
  pickHero(i) { settings.hero = i; save(); session?.isHost ? session.setLocal({ hero: i }) : session?.pickHero(i); },
  setName(n) { settings.name = n; save(); },
  setMatchSettings(s) { if (!session?.isHost) return; if (s.duration) settings.duration = s.duration; if (s.bots != null) settings.bots = s.bots; save(); session.setSettings(s); },
  startSolo() {
    endSession();
    session = new HostSession({ kind: 'solo', name: '@you', hero: settings.hero, settings: { duration: MATCH_DURATIONS.includes(settings.duration) ? settings.duration : 180, bots: true } });
    bindSession(session);
    session.start();
  },
  async openOnline() {
    const { webRelay, playfab } = await webOnline();
    screens.renderOnline({ steam, desktop: platform.isDesktop, webRelay, playfab });
    screens.show('online');
  },
  async hostSteam() {
    if (!steam.available) return;
    try {
      const tr = await new SteamTransport(platform.native.steam).host(8);
      startHost(tr, 'steam', steam.name || localName(), { lobbyId: tr.lobbyId });
    } catch (e) { console.error(e); screens.messageModal(t('msg.steamCreateFail')); }
  },
  async hostLan() {
    const name = localName();
    try {
      if (platform.isDesktop) {
        const res = await platform.lanHost(7777);
        if (!res?.ok) { screens.messageModal(t('msg.lanFail', { port: 7777 })); return; }
        const tr = await new WsTransport(`ws://127.0.0.1:${res.port}/relay`, { role: 'host', room: 'LAN', name }).open();
        const addr = (res.addresses?.[0] || '127.0.0.1') + (res.port !== 7777 ? ':' + res.port : '');
        startHost(tr, 'lan', name, { lan: true, addr, addresses: res.addresses });
      } else if ((await webOnline()).webRelay) {
        const tr = await new WsTransport(platform.webRelayUrl(), { role: 'host', room: '', name }).open();
        startHost(tr, 'web', name, { code: tr.room });
      } else {
        const tr = await withBusy(new PlayFabTransport({ ...playfabConfig(), name }).host());
        startHost(tr, 'web', name, { code: tr.room });
      }
    } catch (e) { console.error(e); if (platform.isDesktop) platform.lanStop(); screens.messageModal(t('msg.connectFail')); }
  },
  async joinAddress(value) {
    if (!value) { $('joinInput').focus(); return; }
    const web = !platform.isDesktop;
    if (web && (await webOnline()).playfab) {
      const code = normalizeCode(value);
      try {
        const tr = await withBusy(new PlayFabTransport({ ...playfabConfig(), name: localName() }).join(code));
        startClient(tr, 'web', { code });
      } catch (e) {
        if (e.code !== 'noRoom' && e.code !== 'full') console.warn('join', e);
        screens.messageModal(e.code === 'noRoom' ? t('msg.noRoom') : e.code === 'full' ? t('msg.full') : t('msg.p2pFail'));
      }
      return;
    }
    const url = web ? platform.webRelayUrl() : platform.relayUrlFor(value);
    try {
      const tr = await new WsTransport(url, { role: 'client', room: web ? value.toUpperCase() : 'LAN', name: localName() }).open();
      if (!web) { settings.lastAddress = value; save(); }
      startClient(tr, web ? 'web' : 'lan', web ? { code: value.toUpperCase() } : { addr: value });
    } catch (e) { screens.messageModal(e.code === 'no-room' ? t('msg.noRoom') : e.code === 'room-full' ? t('msg.full') : t('msg.connectFail')); }
  },
  leaveSession() { endSession(); toMenu(); },
  startMatch() { if (session?.isHost) session.start(); },
  invite() { session?.transport?.invite?.(); },
  copyAddress() { const v = sessionInfo.code || sessionInfo.addr; if (v) navigator.clipboard?.writeText(v).catch(() => {}); },
  setLanguage(l) { settings.lang = l; save(); setLang(l); applyI18n(); screens.renderMenuHeroes(); screens.renderSettings(); hud.refresh(); labels.reset(); if (lastLobby && mode === 'lobby') screens.renderLobby(lastLobby, sessionInfo); updateHeader(); },
  setQuality(q) { settings.quality = q; save(); stage.applyQuality(q); },
  setVolume(key, v) { settings[key] = v; save(); audio.setVolumes({ master: settings.muted ? 0 : settings.volMaster / 100, music: settings.volMusic / 100, sfx: settings.volSfx / 100 }); updateSoundButton(); },
  toggleSetting(key) {
    settings[key] = !settings[key]; save();
    if (key === 'fullscreen') platform.setFullscreen(settings.fullscreen);
    if (key === 'dynamic') stage.setAdaptive(settings.dynamic);
    if (key === 'fps') $('fps').hidden = !settings.fps;
  },
  openPause,
  quit() { platform.quit(); },
  showKeyboard(inputEl) { if (steam.deck && input.device === 'pad') platform.native?.steam?.keyboard?.(inputEl.getBoundingClientRect()); }
};
$('fps').hidden = !settings.fps;

// Online play in a browser: the room server of `npm run web` if this page came
// from it, otherwise PlayFab (published web / Microsoft Store version).
let webOnlineCache = null;
async function webOnline() {
  if (platform.isDesktop) return { webRelay: false, playfab: false };
  if (!webOnlineCache) {
    const pf = !!playfabConfig() && typeof RTCPeerConnection === 'function';
    const webRelay = pf ? false : await platform.webRelayAvailable();
    webOnlineCache = { webRelay, playfab: pf };
  }
  return webOnlineCache;
}
// Shows a "connecting…" note while a slow online step runs.
async function withBusy(promise) {
  const note = $('onlineBusy');
  if (note) note.hidden = false;
  document.body.classList.add('busy');
  try { return await promise; } finally { if (note) note.hidden = true; document.body.classList.remove('busy'); }
}
function startHost(tr, kind, name, info) {
  endSession();
  sessionInfo = info || {};
  session = new HostSession({ transport: tr, kind, name, hero: settings.hero, settings: { duration: settings.duration, bots: settings.bots } });
  bindSession(session);
  lastLobby = session.lobbyState();
  toLobbyScreen();
  platform.presence('lobby', { group: sessionInfo.lobbyId, size: 1 });
}
function startClient(tr, kind, info) {
  endSession();
  sessionInfo = info || {};
  session = new ClientSession({ transport: tr, kind, name: kind === 'steam' ? (steam.name || localName()) : localName(), hero: settings.hero });
  bindSession(session);
  lastLobby = null;
  toLobbyScreen();
  session.hello();
}
async function joinSteamLobby(lobbyId) {
  try {
    const tr = await new SteamTransport(platform.native.steam).join(lobbyId);
    startClient(tr, 'steam', { lobbyId: tr.lobbyId });
  } catch (e) { console.error(e); toMenu(); screens.messageModal(t('msg.steamJoinFail')); }
}
function requestJoinSteam(lobbyId) {
  if (!session || mode === 'menu') { joinSteamLobby(lobbyId); return; }
  if (mode === 'play') { input.setMode('menu'); pauseSolo(true); }
  screens.confirmModal(t('msg.joinFriend'), t('msg.join'), () => { endSession(); joinSteamLobby(lobbyId); }, () => { if (mode === 'play') resumeFromModal(); });
}

function exposeTestApi() {
  window.game = {
    version: GAME_VERSION,
    getState: () => {
      const v = session?.view;
      return {
        mode, lang: getLang(), kind: session?.kind || null, isHost: !!session?.isHost, phase: v?.phase, remaining: v?.remaining, localId: v?.localId, myTarget: v?.myTarget,
        players: (v?.players || []).map(p => ({ id: p.id, hero: p.hero, name: playerName(p, v.localId), bot: p.bot, x: +p.x.toFixed(2), z: +p.z.toFixed(2), score: p.score, dead: p.dead > 0 })),
        lobby: lastLobby, sessionInfo, info: stage.info(), modal: document.getElementById('modal').open, screen: screens.current
      };
    },
    app, stage, hud, screens, labels, startSolo: () => app.startSolo(), pause: () => openPause(),
    setMove: (x, y) => { testMove = x == null ? null : { x, y }; },
    press: b => input.press(b),
    session: () => session,
    achievements
  };
}

boot().catch(e => { console.error(e); fatal(String(e?.message || e)); });
