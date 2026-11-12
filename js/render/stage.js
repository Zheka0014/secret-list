// Renderer, camera, lights and everything drawn in 3D. Reads a "view" (the
// local picture of the match: solo/host read the simulation directly, clients
// read interpolated snapshots) and turns gameplay events into effects.
import * as T from '../../vendor/three.module.js';
import { HEROES, TRAP_COLORS, ARENA } from '../config.js';
import { createKit } from './kit.js';
import { buildWorld } from './world.js';
import { createHeroFactory } from './heroes.js';
import { createFX } from './fx.js';
import { createPost } from './post.js';

export const QUALITY = {
  low: { scale: .75, maxDpr: 1, shadows: false, shadowSize: 1024, msaa: 0, bloom: false, fxaa: true, particles: 600, particleDensity: .5, stars: 260, clouds: 4 },
  medium: { scale: 1, maxDpr: 1, shadows: true, shadowSize: 1024, msaa: 2, bloom: true, fxaa: false, particles: 1000, particleDensity: .8, stars: 480, clouds: 6 },
  high: { scale: 1, maxDpr: 1.5, shadows: true, shadowSize: 2048, msaa: 4, bloom: true, fxaa: false, particles: 1500, particleDensity: 1, stars: 720, clouds: 8 },
  ultra: { scale: 1, maxDpr: 2, shadows: true, shadowSize: 4096, msaa: 4, bloom: true, fxaa: false, particles: 2200, particleDensity: 1.2, stars: 900, clouds: 10 }
};

export async function createStage(container, { quality = 'high', heroTexture } = {}) {
  let q = QUALITY[quality] || QUALITY.high;
  let renderer;
  try {
    renderer = new T.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false });
  } catch (e) {
    const err = new Error('webgl'); err.cause = e; throw err;
  }
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.info.autoReset = false;
  renderer.shadowMap.enabled = q.shadows;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);
  const canvas = renderer.domElement;

  const scene = new T.Scene();
  scene.background = new T.Color(0x403069);
  scene.fog = new T.Fog(0x3d2e68, 44, 110);
  const camera = new T.PerspectiveCamera(43, innerWidth / innerHeight, .1, 190);
  camera.position.set(28, 34, 35); camera.lookAt(0, 0, 0);

  scene.add(new T.HemisphereLight(0xbad9ff, 0x432063, 1.05));
  const sun = new T.DirectionalLight(0xffd4aa, 2.8);
  sun.position.set(-14, 25, 15); sun.castShadow = true;
  sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
  Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 70 });
  sun.shadow.bias = -.0004; sun.shadow.normalBias = .035;
  scene.add(sun);
  const rim = new T.DirectionalLight(0x81bfff, .7); rim.position.set(8, 10, -12); scene.add(rim);
  const fill = new T.PointLight(0xff5fc2, 18, 16, 1.6); fill.position.set(0, 5.2, -4.4); scene.add(fill);

  const texture = heroTexture;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const kit = createKit(T);
  // Trap plates and decorations (plates light up when armed/active).
  const traps = [];
  function buildTraps(list) {
    for (const t of list) {
      const color = TRAP_COLORS[t.type];
      const plateGroup = new T.Group(); plateGroup.userData.dynamic = true; kit.root.add(plateGroup);
      const plate = kit.box(2.5, .07, 2.5, 0x645581, t.x, .08, t.z, plateGroup);
      kit.ring(.77, 0xffcf3d, t.x, .13, t.z);
      for (let a = 0; a < 4; a++) { const arrow = kit.box(.45, .025, .14, 0xffcf3d, t.x + Math.cos(a * Math.PI / 2) * .9, .14, t.z + Math.sin(a * Math.PI / 2) * .9, kit.root, false); arrow.rotation.y = -a * Math.PI / 2; }
      for (const x of [-1.08, 1.08]) for (const z of [-1.08, 1.08]) kit.sphere(.075, 0xd9e4ee, t.x + x, .17, t.z + z);
      const decor = new T.Group(); decor.position.set(t.x, .18, t.z); decor.userData.dynamic = true; kit.root.add(decor);
      if (t.type === 'spring') { for (let i = 0; i < 4; i++) kit.ring(.48, 0xff8b4a, 0, i * .13, 0, decor); kit.box(1.3, .1, 1.3, 0xffb54c, 0, .6, 0, decor); }
      if (t.type === 'cage') { for (const x of [-.85, .85]) for (const z of [-.85, .85]) kit.cylinder(.065, .065, .4, 0xc09bff, x, .2, z, decor); kit.ring(.65, 0xc09bff, 0, .02, 0, decor); }
      if (t.type === 'ice') {
        const crystal = kit.mesh(new T.OctahedronGeometry(.4), 0x70eaff, 0, .3, 0, decor); crystal.scale.set(1, .45, 1); kit.ring(.62, 0x70eaff, 0, .02, 0, decor);
        for (let i = 0; i < 5; i++) { const a = i * 1.256, c = kit.mesh(new T.OctahedronGeometry(.18), 0x87eaff, t.x + Math.sin(a) * .6, .3, t.z + Math.cos(a) * .6); c.scale.y = 1.6; }
      }
      kit.bakeLocal(decor);
      const fxGroup = new T.Group(); fxGroup.position.set(t.x, .28, t.z); fxGroup.userData.dynamic = true; kit.root.add(fxGroup);
      const arc = kit.ring(1.15, color, 0, .015, 0, fxGroup);
      const pillars = [];
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2, p = kit.box(.09, 1, .09, color, Math.sin(a) * 1.1, .5, Math.cos(a) * 1.1, fxGroup); p.visible = false; pillars.push(p); }
      traps.push({ id: t.id, type: t.type, x: t.x, z: t.z, plate, decor, fxGroup, arc, pillars, state: 'idle' });
    }
  }

  let world;
  const actors = [];
  let heroFactory, fx, post;
  const cages = new Map();
  const markers = {};

  function buildScene(trapList) {
    buildTraps(trapList);
    world = buildWorld(kit, scene, q);
    heroFactory = createHeroFactory(T, texture, { shadows: true });
    fx = createFX(T, scene, q);
    post = createPost(T, renderer);
    post.configure(q);
    // Floor markers: you (soft white-gold) and your target (red-gold, rotating dashes).
    const markTex = (dashed) => {
      const c = document.createElement('canvas'); c.width = c.height = 256; const k = c.getContext('2d');
      k.translate(128, 128); k.lineWidth = 16; k.strokeStyle = '#fff';
      if (dashed) { for (let i = 0; i < 12; i++) { k.beginPath(); k.arc(0, 0, 100, i * Math.PI / 6 + .08, (i + 1) * Math.PI / 6 - .12); k.stroke(); } k.lineWidth = 6; k.beginPath(); k.arc(0, 0, 78, 0, Math.PI * 2); k.stroke(); }
      else { k.beginPath(); k.arc(0, 0, 100, 0, Math.PI * 2); k.stroke(); k.fillStyle = '#fff'; k.beginPath(); k.moveTo(0, -126); k.lineTo(-16, -100); k.lineTo(16, -100); k.fill(); }
      const t = new T.CanvasTexture(c); t.anisotropy = 4; return t;
    };
    const markMat = (tex, color) => new T.MeshBasicMaterial({ map: tex, color, transparent: true, depthWrite: false, blending: T.AdditiveBlending });
    markers.self = new T.Mesh(new T.PlaneGeometry(2.1, 2.1), markMat(markTex(false), new T.Color(0xfff1c2).multiplyScalar(1.6)));
    markers.target = new T.Mesh(new T.PlaneGeometry(2.6, 2.6), markMat(markTex(true), new T.Color(0xff5c7a).multiplyScalar(2.2)));
    for (const m of [markers.self, markers.target]) { m.rotation.x = -Math.PI / 2; m.position.y = .26; m.renderOrder = 3; m.visible = false; scene.add(m); }
  }

  function applyQuality(name) {
    const next = QUALITY[name] || QUALITY.high;
    const shadowChanged = next.shadows !== q.shadows;
    const sizeChanged = next.shadowSize !== q.shadowSize;
    q = next;
    renderer.shadowMap.enabled = q.shadows;
    if (sizeChanged) { sun.shadow.mapSize.set(q.shadowSize, q.shadowSize); sun.shadow.map?.dispose(); sun.shadow.map = null; }
    if (shadowChanged) scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.needsUpdate = true; }); });
    post?.configure(q);
    resize();
  }

  let dynScale = 1;
  function pixelRatio() { return Math.min(devicePixelRatio || 1, q.maxDpr) * q.scale * dynScale; }
  function resize() {
    const w = container.clientWidth || innerWidth, h = container.clientHeight || innerHeight;
    camera.aspect = w / h;
    camera.fov = w / h < 1 ? 60 : 43;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(pixelRatio());
    renderer.setSize(w, h, false);
    canvas.style.width = '100%'; canvas.style.height = '100%';
    const drawH = h * pixelRatio();
    fx?.setScale(drawH * camera.projectionMatrix.elements[5] * .5);
  }
  addEventListener('resize', resize);

  // ---- camera ------------------------------------------------------------------
  const cam = { angle: .42, zoom: 1, focus: new T.Vector3(0, 1.5, -1), overview: false, shake: 0, orbit: 0 };
  const viewRight = new T.Vector3(1, 0, 0), viewForward = new T.Vector3(0, 0, -1);
  function updateCamera(dt, mode, me) {
    const narrow = camera.aspect < 1;
    let follow = mode === 'play' && me && !cam.overview;
    if (mode === 'menu') cam.angle += dt * .045;
    const target = follow ? new T.Vector3(me.x * .7, 1.2, me.z * .7) : new T.Vector3(0, 1.5, -1);
    cam.focus.lerp(target, 1 - Math.exp(-dt * 5));
    const d = (follow ? (narrow ? 18 : 25) : mode === 'menu' ? (narrow ? 34 : 31) : (narrow ? 29 : 33)) * cam.zoom;
    camera.position.set(cam.focus.x + Math.sin(cam.angle) * d, cam.focus.y + d * .73, cam.focus.z + Math.cos(cam.angle) * d);
    if (cam.shake > 0) {
      cam.shake = Math.max(0, cam.shake - dt * 2.6);
      const s = cam.shake * cam.shake * .5, t = performance.now() * .05;
      camera.position.x += Math.sin(t * 1.7) * s; camera.position.y += Math.sin(t * 2.3 + 1) * s * .7; camera.position.z += Math.cos(t * 1.9) * s;
    }
    camera.lookAt(cam.focus);
    viewForward.set(-Math.sin(cam.angle), 0, -Math.cos(cam.angle));
    viewRight.set(Math.cos(cam.angle), 0, -Math.sin(cam.angle));
  }

  // ---- heroes ------------------------------------------------------------------
  function actorFor(p) {
    let a = actors[p.id];
    if (!a || a.baseHero !== p.hero) {
      if (a) { scene.remove(a.group, a.blob); }
      a = new heroFactory.Actor(p.hero);
      a.baseHero = p.hero; a.lastGhost = 0; a.stepT = 0;
      actors[p.id] = a;
      scene.add(a.group, a.blob);
    }
    return a;
  }
  function cageFor(id, x, z) {
    let c = cages.get(id);
    if (!c) {
      c = new T.Group(); c.userData.dynamic = true;
      for (const cx of [-.8, .8]) for (const cz of [-.8, .8]) kit.cylinder(.055, .055, 2.8, 0xbd8cff, cx, 1.4, cz, c);
      kit.box(1.8, .12, 1.8, 0x9f6dc6, 0, 2.9, 0, c);
      kit.ring(1.1, 0xffcf3d, 0, .15, 0, c);
      scene.add(c); kit.bakeLocal(c); cages.set(id, c);
    }
    c.position.set(x, 0, z);
    return c;
  }

  let clock = 0, ambientT = 0;
  const hl = { me: new T.Color(0xfff3c4), target: new T.Color(0xff4f6d), mask: new T.Color(0xc79bff) };
  const xray = { me: new T.Color(0xffcf3d), target: new T.Color(0xff5f7e), other: new T.Color(0xbfaefc) };
  const tmpV = new T.Vector3();

  const frameInfo = { calls: 0, triangles: 0 };
  function update(view, dt, { mode = 'play', running = true } = {}) {
    frameInfo.calls = renderer.info.render.calls; frameInfo.triangles = renderer.info.render.triangles;
    renderer.info.reset();
    clock += dt;
    const me = view?.players?.[view.localId];
    updateCamera(dt, mode, me && !me.dead ? me : me ? { x: me.x, z: me.z } : null);
    const active = running || mode === 'menu';
    const myTarget = view && view.myTarget >= 0 ? view.players[view.myTarget] : null;
    if (view?.players) {
      for (const p of view.players) {
        if (!p) continue;
        const a = actorFor(p);
        const visible = !(p.dead > 0) && !p.hidden;
        a.group.visible = visible; a.blob.visible = visible;
        a.group.position.set(p.x, 0, p.z); a.blob.position.set(p.x, .245, p.z);
        const isMe = p.id === view.localId;
        a.showHero(p.disguiseHero >= 0 ? p.disguiseHero : p.hero);
        const u = a.u;
        const targeted = myTarget === p && !(p.disguise > 0);
        if (isMe && mode !== 'menu') { u.hlColor.value.copy(p.disguise > 0 ? hl.mask : hl.me); u.hlAmt.value = 1; u.outlinePx.value = 8.5; }
        else if (targeted && mode === 'play') { u.hlColor.value.copy(hl.target); u.hlAmt.value = .6 + .4 * Math.sin(clock * 6); u.outlinePx.value = 9; }
        else { u.hlAmt.value = 0; u.outlinePx.value = 7; }
        u.alpha.value = isMe && p.disguise > 0 ? .72 : 1;
        a.xray.visible = mode === 'play';
        u.xrayColor.value.copy(isMe ? xray.me : targeted ? xray.target : xray.other);
        a.shield.visible = visible && p.shield > 0;
        a.shieldMat.uniforms.amount.value = Math.min(1, p.shield * 2);
        a.animate(p, dt, active, viewRight);
        // Dash after-images and footstep dust.
        if (visible && p.dashT > 3.45 && clock - a.lastGhost > .045) {
          a.lastGhost = clock;
          heroFactory.spawnGhost(scene, a.shownHero, p.x, p.z, { life: .3, alpha: .5, tint: HEROES[p.hero].color, facing: a.u.facing.value, pace: a.u.pace.value, stride: a.u.stride.value, rim: 0, outline: 5 });
        }
        a.stepT -= dt;
        if (visible && a.motion.pace > .6 && a.stepT <= 0) { a.stepT = .28; fx.footstep(p.x, p.z); }
        if (p.caught > 0) cageFor(p.id, p.x, p.z).visible = true;
        else if (cages.has(p.id)) cages.get(p.id).visible = false;
      }
      for (let i = view.players.length; i < actors.length; i++) if (actors[i]) { scene.remove(actors[i].group, actors[i].blob); actors[i] = null; }
    }
    // Markers
    const showMarks = mode === 'play' && me;
    markers.self.visible = !!(showMarks && !(me.dead > 0));
    if (markers.self.visible) { markers.self.position.set(me.x, .26, me.z); markers.self.rotation.z = -Math.atan2(me.fx || 0, me.fz || 1) + Math.PI; const s = 1 + Math.sin(clock * 4) * .04; markers.self.scale.set(s, s, 1); }
    markers.target.visible = !!(showMarks && myTarget && !(myTarget.dead > 0) && !(myTarget.disguise > 0));
    if (markers.target.visible) { markers.target.position.set(myTarget.x, .27, myTarget.z); markers.target.rotation.z = clock * 1.4; const s = 1 + Math.sin(clock * 6) * .07; markers.target.scale.set(s, s, 1); }
    // Traps
    if (view?.traps) for (const vt of view.traps) {
      const t = traps[vt.id]; if (!t) continue;
      const activeT = vt.active > 0, warm = vt.warm > 0;
      t.plate.material = kit.toon(activeT ? 0xff7197 : warm ? 0xffcf3d : 0x645581, activeT);
      t.plate.position.y = activeT ? .3 : .08;
      t.decor.position.y = activeT ? .5 : .18;
      if (t.type === 'spring') t.decor.scale.y = warm ? .5 : activeT ? 1.6 : 1;
      t.arc.rotation.z = clock * (activeT ? 3 : .4);
      const s = warm ? 1 + Math.sin(clock * 15) * .06 : 1; t.arc.scale.setScalar(s);
      t.pillars.forEach((p, i) => { p.visible = activeT; p.scale.y = .5 + Math.sin(clock * 8 + i) * .3; p.position.y = p.scale.y / 2; });
      t.fxGroup.position.y = activeT ? .38 : .19;
    }
    // Ambient steam from the ramen shop tank.
    ambientT -= dt;
    if (ambientT <= 0) { ambientT = .18 / q.particleDensity; fx.steam(-8, 7, -7); }
    world.update(dt, pixelRatio());
    heroFactory.updateGhosts(dt, g => { if (g.onDone) g.onDone(g); });
    fx.update(dt);
    kit.outlineUniforms.outlineWidth.value = .0021 * (camera.aspect < 1 ? 1.3 : 1);
    if (flash.a > 0) { flash.a = Math.max(0, flash.a - dt * 2.5); post.setFlash(flash.color, flash.a); }
    post.render(scene, camera);
    adaptResolution(dt);
  }

  const flash = { a: 0, color: new T.Color(1, 1, 1) };
  function screenFlash(color, amount) { flash.color.set(color); flash.a = amount; }

  // Dynamic resolution: keeps big screens smooth on weak GPUs.
  let adaptT = 0, adaptFrames = 0, adaptive = true;
  function adaptResolution(dt) {
    if (!adaptive) return;
    adaptT += dt; adaptFrames++;
    if (adaptT < 2) return;
    const fps = adaptFrames / adaptT; adaptT = 0; adaptFrames = 0;
    const prev = dynScale;
    if (fps < 45 && dynScale > .6) dynScale = Math.max(.6, dynScale - .1);
    else if (fps > 58 && dynScale < 1) dynScale = Math.min(1, dynScale + .05);
    if (prev !== dynScale) resize();
  }

  function onEvent(e, view) {
    const P = id => view.players[id];
    const localId = view.localId;
    switch (e.type) {
      case 'attack': { const p = P(e.p); if (p) fx.attack(p.x, p.z, e.p === localId); break; }
      case 'hit': { fx.hit(e.x, e.z); if (e.p === localId) { cam.shake = Math.max(cam.shake, .9); } break; }
      case 'dash': { const p = P(e.p); if (p) fx.dash(p.x, p.z, HEROES[p.hero].color); break; }
      case 'elim': {
        const v = P(e.v); if (!v) break;
        const color = HEROES[v.disguiseHero >= 0 ? v.disguiseHero : v.hero].color;
        const heroShown = actors[e.v]?.shownHero ?? v.hero;
        const facing = actors[e.v]?.u.facing.value ?? 1;
        if (e.why === 'edge') {
          const sp = Math.max(3, Math.hypot(e.vx, e.vz)), nx = e.vx / (Math.hypot(e.vx, e.vz) || 1), nz = e.vz / (Math.hypot(e.vx, e.vz) || 1);
          heroFactory.spawnGhost(scene, heroShown, e.x, e.z, { mode: 'fall', life: 1.1, vx: nx * Math.min(sp, 7) || 0, vz: nz * Math.min(sp, 7) || 0, vy: 4, spinV: (Math.random() - .5) * 9, facing, hurt: .3, onDone: g => fx.splash(g.mesh.position.x, g.mesh.position.z, color) });
          fx.sparks(Math.max(-ARENA.edgeX, Math.min(ARENA.edgeX, e.x)), .5, Math.max(-ARENA.edgeZ, Math.min(ARENA.edgeZ, e.z)), 14, color, 4, 3);
        } else if (e.why === 'spring') {
          heroFactory.spawnGhost(scene, heroShown, e.x, e.z, { mode: 'spring', life: 1.25, vy: 17, spinV: 7, facing, hurt: .25, onDone: g => fx.elim(g.mesh.position.x, g.mesh.position.z, color, Math.max(1, g.y)) });
        } else fx.elim(e.x, e.z, color);
        if (e.v === localId) { cam.shake = 1.4; screenFlash(0xff6f91, .28); }
        break;
      }
      case 'order': { const p = P(e.p); if (p) fx.order(p.x, p.z); if (e.p === localId) screenFlash(0xffe27a, .22); break; }
      case 'respawn': { const p = P(e.p); if (p) fx.respawn(e.x ?? p.x, e.z ?? p.z, HEROES[p.hero].color); break; }
      case 'trapArm': { const t = traps[e.trap]; if (t) fx.trapArm(t); break; }
      case 'trapFire': { const t = traps[e.trap]; if (t) { fx.trapFire(t); const me = P(localId); if (me && Math.hypot(me.x - t.x, me.z - t.z) < 6) cam.shake = Math.max(cam.shake, .5); } break; }
      case 'mask': case 'unmask': { const p = P(e.p); if (p && (e.type === 'mask' || e.reason !== 'elim')) fx.mask(p.x, p.z); break; }
      case 'slip': { const p = P(e.p); if (p) fx.sparks(p.x, .4, p.z, 14, 0xb5f6ff, 3, 2, { shape: 1, size: .3 }); break; }
      case 'caught': { fx.puffs(e.x, .3, e.z, 10, 0x8b7bb8, { size: .8 }); if (e.p === localId) cam.shake = Math.max(cam.shake, .7); break; }
    }
  }

  function project(x, y, z, out) {
    tmpV.set(x, y, z).project(camera);
    out.x = (tmpV.x * .5 + .5) * canvas.clientWidth;
    out.y = (-tmpV.y * .5 + .5) * canvas.clientHeight;
    out.visible = tmpV.z < 1;
    return out;
  }

  function resetMatchVisuals() {
    fx?.clear();
    for (const c of cages.values()) c.visible = false;
    for (const a of actors) if (a) a.motion.lastX = null;
  }

  return {
    T, renderer, scene, camera, canvas, cam, viewRight, viewForward,
    buildScene, update, onEvent, project, resize, applyQuality, resetMatchVisuals, screenFlash,
    debugActors: () => actors.map(a => a && { base: a.baseHero, shown: a.shownHero, visible: a.group.visible, facing: a.u.facing.value, parent: !!a.group.parent, pos: a.group.position.toArray().map(v => +v.toFixed(2)), alpha: a.u.alpha.value, rect: a.u.rect.value.toArray().map(v => +v.toFixed(3)) }),
    setAdaptive(v) { adaptive = v; if (!v && dynScale !== 1) { dynScale = 1; resize(); } },
    get quality() { return q; },
    info: () => ({ calls: frameInfo.calls, triangles: frameInfo.triangles, programs: renderer.info.programs?.length, dynScale })
  };
}
