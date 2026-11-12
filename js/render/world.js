// Neon Rooftop arena. Geometry follows the original v7 layout (collision boxes
// in config.js match the props), with ambient life added: swaying lanterns,
// flickering signs, twinkling windows and stars, drifting clouds, a blimp and
// sweeping searchlights. Static props are baked by kit.bake().
import { makeRng } from '../rng.js';

const FONT = "'Nunito Variable', 'Nunito', 'Arial Rounded MT Bold', Arial, sans-serif";

export function buildWorld(kit, scene, quality) {
  const T = kit.T, { box, sphere, cylinder, ring, lightBox, mesh, root } = kit;
  const rand = makeRng(44);
  const animated = [];

  const glowTexture = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(.15, 'rgba(255,255,255,.3)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
  })();
  const softTexture = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,.9)'); grd.addColorStop(.5, 'rgba(255,255,255,.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    return new T.CanvasTexture(c);
  })();

  function halo(x, y, z, color, size, parent = scene, opacity = .65) {
    const s = new T.Sprite(new T.SpriteMaterial({ map: glowTexture, color, transparent: true, blending: T.AdditiveBlending, depthWrite: false, opacity, fog: true }));
    s.position.set(x, y, z); s.scale.setScalar(size); parent.add(s);
    return s;
  }
  // Soft light pool on the floor (fake bounce light from neon).
  function pool(x, z, color, w, d = w, opacity = .22) {
    const m = new T.Mesh(new T.PlaneGeometry(w, d), new T.MeshBasicMaterial({ map: softTexture, color, transparent: true, opacity, blending: T.AdditiveBlending, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, .24, z); m.renderOrder = 1;
    scene.add(m);
    return m;
  }
  function prop(x, z, w, d, h, color) { box(w, h, d, color, x, h / 2, z); }
  const signs = [];
  function label(text, w, h, x, y, z, color = '#ffe775', bg = '#292048', flicker = 0) {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 256;
    const k = c.getContext('2d');
    k.fillStyle = bg; k.fillRect(0, 0, 1024, 256);
    k.strokeStyle = color; k.lineWidth = 9; k.strokeRect(12, 12, 1000, 232);
    k.shadowColor = color; k.shadowBlur = 24;
    k.fillStyle = color; k.font = `1000 104px ${FONT}`; k.textAlign = 'center'; k.textBaseline = 'middle';
    k.fillText(text, 512, 136);
    const texture = new T.CanvasTexture(c); texture.colorSpace = T.SRGBColorSpace; texture.anisotropy = 4;
    const mat = new T.MeshBasicMaterial({ map: texture });
    mat.color.setScalar(1.35);
    const m = new T.Mesh(new T.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z); scene.add(m);
    signs.push({ mat, base: 1.35, flicker, phase: rand() * 10 });
    return m;
  }

  // ---- rooftop slab -------------------------------------------------------
  box(25.4, 1.2, 23.4, 0x302958, 0, -.68, 0); box(26, .38, 24, 0x7d49d7, 0, -1.45, 0); box(25, .24, 23, 0x383c8b, 0, -.02, 0);
  box(24, 7.5, 22, 0x3e356e, 0, -5.6, 0);
  for (let x = -11; x <= 11; x += 2) for (let z = -10; z <= 10; z += 2) box(1.97, .025, 1.97, ((x + z + 30) / 2) % 2 ? 0x525caf : 0x5863b7, x, .115, z, root, false);
  for (const x of [-7.1, 7.1]) { box(2.1, .028, 18, 0x8955b8, x, .142, 0, root, false); for (let z = -8; z < 9; z += 1.8) box(.13, .035, .65, 0xf4a56f, x, .166, z, root, false); }
  for (const z of [-3.5, 3.5]) box(21, .03, .14, 0x52d8d0, 0, .17, z, root, false);
  cylinder(3.5, 3.5, .025, 0x273c71, 0, .17, 0, root, 48); ring(3.25, 0x5eeed6, 0, .20, 0); ring(3.45, 0x292143, 0, .20, 0);
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, mark = box(.32, .025, .8, 0xffcf3d, Math.sin(a) * 2.95, .20, Math.cos(a) * 2.95, root, false); mark.rotation.y = a; }
  const star = new T.Shape();
  for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5, r = i % 2 ? .5 : 1.1; if (i === 0) star.moveTo(Math.sin(a) * r, Math.cos(a) * r); else star.lineTo(Math.sin(a) * r, Math.cos(a) * r); }
  star.closePath();
  const starMesh = mesh(new T.ShapeGeometry(star), 0xffcf3d, 0, .22, 0, root, false); starMesh.rotation.x = -Math.PI / 2;
  // Danger lines along the roof edge: cyan on the long sides, pink on the short ones.
  for (const z of [-11.45, 11.45]) { lightBox(24, .07, .08, 0x5dfce0, 0, -.29, z); for (let x = -11; x <= 11; x += 1.2) box(.63, .035, .22, 0xffcd55, x, .17, z * .94, root, false); }
  for (const x of [-12.45, 12.45]) lightBox(.08, .07, 22, 0xfc6abd, x, -.29, 0);

  // ---- storefronts --------------------------------------------------------
  function shop(x, z, w, d, h, color, roofColor, title, light) {
    prop(x, z, w, d, h, color);
    box(w + .6, .42, d + .5, roofColor, x, h + .2, z); box(w + .2, .22, d + .25, 0x252248, x, .14, z); box(w + .3, .24, d + .4, 0xffcf85, x, h - .35, z);
    for (const side of [-1, 1]) box(.25, h, .22, roofColor, x + side * (w / 2 - .15), h / 2, z + d / 2 + .06);
    for (let i = 0; i < 3; i++) {
      const wx = x + (i - 1) * w * .27;
      box(w * .23, 1.7, .16, 0x251e49, wx, 1.65, z + d / 2 + .1);
      lightBox(w * .19, 1.4, .04, light, wx, 1.66, z + d / 2 + .20);
      box(w * .28, .14, .35, roofColor, wx, .75, z + d / 2 + .1);
    }
    label(title, w * .9, .8, x, h - .95, z + d / 2 + .19, '#fff0b5', '#292048', title === 'NEON CLUB' ? 1 : 0);
    for (let i = 0; i < 8; i++) {
      const aw = box(w / 8, .18, 1.05, i % 2 ? 0xffedd2 : roofColor, x - w / 2 + w / 16 + i * w / 8, h - 1.6, z + d / 2 + .45); aw.rotation.x = .13;
      box(w / 8, .28, .09, i % 2 ? 0xffedd2 : roofColor, x - w / 2 + w / 16 + i * w / 8, h - 1.82, z + d / 2 + .97);
    }
    pool(x, z + d / 2 + 1.6, light, w * 1.05, 2.6, .2);
  }
  shop(-8, -7, 5, 4, 4.9, 0xc15ad7, 0xff7589, 'MOON RAMEN', 0xffbd79);
  shop(7.7, -7.5, 5.7, 4, 5.7, 0x21bdb2, 0x5165d9, 'NEON CLUB', 0x8ef7e6);
  shop(-9, 4, 3.8, 4, 3.2, 0xf4a14e, 0xfa6684, 'ARCADE', 0xffd05f);

  // ---- lucky cat on the club roof (waving paw) ----------------------------
  const mascot = new T.Group(); mascot.position.set(7.7, 6.2, -7.5); root.add(mascot);
  sphere(1.12, 0xffe8b1, 0, 1.05, 0, mascot, [.95, 1.1, .8]); sphere(1.18, 0xffe8b1, 0, 2.48, 0, mascot, [1.1, .85, .8]);
  for (const x of [-.76, .76]) {
    mesh(new T.ConeGeometry(.48, .85, 3), 0xffe8b1, x, 3.22, 0, mascot);
    mesh(new T.ConeGeometry(.28, .45, 3), 0xfc8fa0, x, 3.24, .31, mascot);
    mesh(new T.TorusGeometry(.2, .04, 6, 16, Math.PI), 0x302345, x * .58, 2.5, .85, mascot, false);
  }
  sphere(.12, 0xe87197, 0, 2.31, .91, mascot); sphere(.38, 0xffcc3d, 0, 1.27, .82, mascot, [1, 1, .25]);
  ring(.88, 0xfb739c, 0, 1.88, 0, mascot);
  const pawPivot = new T.Group(); pawPivot.position.set(1.05, 1.6, .2); pawPivot.userData.dynamic = true; mascot.add(pawPivot);
  sphere(.38, 0xffe8b1, 0, .42, 0, pawPivot, [.8, 1.7, .8]);
  animated.push(t => { pawPivot.rotation.z = Math.sin(t * 2.2) * .35 - .1; });

  // ---- entrance arch ------------------------------------------------------
  for (const x of [-3.15, 3.15]) { prop(x, -9.5, .45, .55, 4.7, 0x7265cb); lightBox(.16, 3.6, .13, 0xff76c8, x, 2.6, -9.18); }
  box(7.2, .9, .6, 0x352653, 0, 4.65, -9.5);
  label('SECRET ROOFTOP', 6.5, .65, 0, 4.65, -9.16, '#ffdc60', '#292048', 2);
  // Marquee bulbs: one instanced mesh, blinking through instance colours.
  const bulbGeo = new T.SphereGeometry(.095, 10, 8);
  const bulbs = new T.InstancedMesh(bulbGeo, new T.MeshBasicMaterial({ color: 0xffffff }), 9);
  const bulbColors = [];
  for (let i = 0; i < 9; i++) {
    bulbs.setMatrixAt(i, new T.Matrix4().makeTranslation(-3.2 + i * .8, 5.2, -9.2));
    bulbColors.push(new T.Color(i % 2 ? 0xff7ac8 : 0xffdb64).multiplyScalar(4));
    bulbs.setColorAt(i, bulbColors[i]);
  }
  scene.add(bulbs);
  const bulbHull = new T.InstancedMesh(kit.hullGeometry(bulbGeo), kit.outlineMaterial, 9);
  for (let i = 0; i < 9; i++) { const m = new T.Matrix4(); bulbs.getMatrixAt(i, m); bulbHull.setMatrixAt(i, m); }
  scene.add(bulbHull);

  // ---- trees and pods -----------------------------------------------------
  for (const [x, z] of [[-5, 6], [8, 4.5], [3, -7.8]]) {
    prop(x, z, 1.5, 1.5, .65, 0x59438c); box(1.65, .13, 1.65, 0xf997c2, x, .67, z); cylinder(.17, .25, 1.6, 0x84536f, x, 1.35, z);
    for (let i = 0; i < 7; i++) { const a = i * 2.4, r = i < 4 ? .64 : .25; sphere(.85, i % 3 === 0 ? 0xffd050 : i % 3 === 1 ? 0xffab45 : 0xff7864, x + Math.sin(a) * r, 2.5 + i * .12, z + Math.cos(a) * r); }
  }
  for (const [x, z] of [[-2, 4.6], [5, 1], [2, -2]]) {
    prop(x, z, 1.9, 1.2, 1.05, 0x328dba); box(2, .2, 1.3, 0x87e3db, x, 1.05, z); cylinder(.43, .43, .04, 0x284c76, x, 1.17, z, root, 20); ring(.34, 0x92fbe4, x, 1.20, z);
    for (let i = 0; i < 5; i++) box(.09, .58, .04, 0x1f5d87, x - .6 + i * .3, .65, z + .62, root, false);
  }

  // ---- lantern bridge: instanced lanterns that sway on their strings ---------
  const lanternGeo = new T.SphereGeometry(.34, 16, 12), capGeo = new T.CylinderGeometry(.12, .12, .12, 12), tasselGeo = new T.CylinderGeometry(.03, .04, .27, 8);
  const lanternMat = new T.MeshBasicMaterial({ color: 0xffffff });
  const lantern = new T.InstancedMesh(lanternGeo, lanternMat, 9);
  const caps = new T.InstancedMesh(capGeo, kit.toon(0x4b365a), 9), tassels = new T.InstancedMesh(tasselGeo, kit.toon(0xffbf59), 9);
  const lanternHull = new T.InstancedMesh(kit.hullGeometry(lanternGeo), kit.outlineMaterial, 9);
  const capHull = new T.InstancedMesh(kit.hullGeometry(capGeo), kit.outlineMaterial, 9);
  for (const m of [lantern, caps, tassels]) { m.castShadow = true; }
  scene.add(lantern, caps, tassels, lanternHull, capHull);
  const lanterns = [];
  for (let i = 0; i < 9; i++) {
    const x = -8 + i * 2, y = 6.8 - Math.sin(i / 8 * Math.PI) * 1.8;
    lantern.setColorAt(i, new T.Color(i % 2 ? 0xff81c7 : 0xffb84b).multiplyScalar(4.3));
    lanterns.push({ pivot: new T.Vector3(x, y + .56, -4.4), phase: i * .7, halo: halo(x, y, -4.4, i % 2 ? 0xff54bf : 0xffb43e, 2) });
  }
  const points = [];
  for (let i = 0; i <= 48; i++) points.push(new T.Vector3(-8 + i / 3, 7.18 - Math.sin(i / 48 * Math.PI) * 1.8, -4.4));
  scene.add(new T.Line(new T.BufferGeometry().setFromPoints(points), new T.LineBasicMaterial({ color: 0x221a3d })));
  const swing = new T.Matrix4(), part = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), one = new T.Vector3(1, 1, 1), stretch = new T.Vector3(1, 1.22, 1), off = new T.Vector3();
  animated.push(t => {
    lanterns.forEach((l, i) => {
      e.set(Math.sin(t * .9 + l.phase * 1.7) * .05, 0, Math.sin(t * 1.3 + l.phase) * .09);
      q.setFromEuler(e);
      swing.compose(l.pivot, q, one);
      const place = (mesh, y, scale = one) => { part.compose(off.set(0, y, 0), new T.Quaternion(), scale); part.premultiply(swing); mesh.setMatrixAt(i, part); };
      place(lantern, -.56, stretch); place(lanternHull, -.56, stretch); place(caps, -.12); place(capHull, -.12); place(tassels, -1.07);
      off.set(0, -.56, 0).applyMatrix4(swing); l.halo.position.copy(off);
    });
    for (const m of [lantern, lanternHull, caps, capHull, tassels]) m.instanceMatrix.needsUpdate = true;
  });

  // ---- perimeter lamps, tank --------------------------------------------------
  for (const [x, z] of [[-11, -10], [11, -10], [-11, 10], [11, 10]]) {
    cylinder(.09, .15, 3.8, 0x352655, x, 1.9, z); box(.5, .12, .5, 0xffda6b, x, 3.83, z);
    mesh(new T.SphereGeometry(.2, 12, 8), 0xffd586, x, 3.6, z, root, true, true);
    halo(x, 3.6, z, 0xffd071, 2.4); pool(x * .96, z * .96, 0xffc46b, 4.2, 4.2, .16);
  }
  cylinder(.85, .85, 1.3, 0x64d4c0, -8, 6, -7, root, 20); cylinder(.97, .97, .18, 0x293e6c, -8, 6.75, -7, root, 20);
  pool(0, 0, 0x5eeed6, 8.4, 8.4, .09);

  // ---- city skyline (backdrop) with twinkling windows ----------------------
  for (let i = 0; i < 36; i++) {
    const a = i / 36 * Math.PI * 2, r = 29 + rand() * 18, x = Math.sin(a) * r, z = Math.cos(a) * r, w = 3 + rand() * 3, h = 6 + rand() * 15;
    const b = box(w, h, 4, [0x343c76, 0x464083, 0x27416c][i % 3], x, h / 2 - 12, z, root, false); b.userData.kit.backdrop = true;
    const cap = box(w + .2, .18, 4.2, 0x5a579c, x, h - 11.9, z, root, false); cap.userData.kit.backdrop = true;
    for (let row = 0; row < 6; row++) for (let col = 0; col < 3; col++) {
      if (rand() < .28) continue;
      const win = lightBox(.3, .58, .03, i % 3 === 0 ? 0xffbc72 : 0x8184db, x + (col - 1) * w * .23, -10 + row * (h - 2) / 6, z + 2.03);
      win.userData.kit.window = true;
    }
    if (rand() < .3) mesh(new T.SphereGeometry(.14, 8, 6), 0xff4a6b, x, h - 11.6, z, root, false, true);
  }

  // ---- sky: gradient dome, stars, moon, clouds -----------------------------
  const skyMat = new T.ShaderMaterial({
    side: T.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new T.Color(0x0c1238) }, mid: { value: new T.Color(0x2a2567) }, bottom: { value: new T.Color(0x5a3f8f) } },
    vertexShader: 'varying vec3 v;void main(){v=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec3 v;uniform vec3 top;uniform vec3 mid;uniform vec3 bottom;
void main(){float h=normalize(v).y;vec3 c=mix(bottom,mid,smoothstep(-.15,.22,h));c=mix(c,top,smoothstep(.2,.85,h));gl_FragColor=vec4(c,1.);
#include <colorspace_fragment>
}`
  });
  const sky = new T.Mesh(new T.SphereGeometry(105, 32, 16), skyMat); sky.renderOrder = -10; scene.add(sky);

  const starCount = quality.stars;
  const starPos = new Float32Array(starCount * 3), starPhase = new Float32Array(starCount), starSize = new Float32Array(starCount);
  for (let i = 0; i < starCount; i++) {
    const u = rand() * Math.PI * 2, h = .12 + rand() * .88, r = 98, rr = Math.sqrt(1 - h * h) * r;
    starPos[i * 3] = Math.cos(u) * rr; starPos[i * 3 + 1] = h * r; starPos[i * 3 + 2] = Math.sin(u) * rr;
    starPhase[i] = rand() * 6.28; starSize[i] = .6 + rand() * rand() * 2.2;
  }
  const starGeo = new T.BufferGeometry();
  starGeo.setAttribute('position', new T.BufferAttribute(starPos, 3));
  starGeo.setAttribute('phase', new T.BufferAttribute(starPhase, 1));
  starGeo.setAttribute('size', new T.BufferAttribute(starSize, 1));
  const starMat = new T.ShaderMaterial({
    transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false,
    uniforms: { time: { value: 0 }, px: { value: 1 } },
    vertexShader: 'attribute float phase;attribute float size;uniform float time;uniform float px;varying float vA;void main(){vA=.45+.55*sin(time*(1.2+phase*.3)+phase*9.);gl_PointSize=size*px*(1.+.3*vA);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'varying float vA;void main(){vec2 d=gl_PointCoord-.5;float a=smoothstep(.5,0.,length(d));gl_FragColor=vec4(vec3(1.,.95,.86)*a*vA*1.6,1.);}'
  });
  const stars = new T.Points(starGeo, starMat); stars.renderOrder = -9; stars.frustumCulled = false; scene.add(stars);

  const moon = new T.Mesh(new T.SphereGeometry(4, 32, 24), new T.MeshBasicMaterial({ color: 0xffddae, fog: false }));
  moon.material.color.multiplyScalar(1.4);
  moon.position.set(-30, 29, -44); scene.add(moon); halo(-30, 29, -44, 0xffd8ad, 16, scene, .55);

  const clouds = [];
  const cloudMat = new T.SpriteMaterial({ map: softTexture, color: 0x6d5aa8, transparent: true, opacity: .22, depthWrite: false, fog: false });
  for (let i = 0; i < quality.clouds; i++) {
    const s = new T.Sprite(cloudMat); const a = rand() * Math.PI * 2, r = 55 + rand() * 25;
    s.position.set(Math.cos(a) * r, 16 + rand() * 18, Math.sin(a) * r); s.scale.set(26 + rand() * 20, 8 + rand() * 5, 1);
    scene.add(s); clouds.push({ s, a, r, speed: .004 + rand() * .006 });
  }

  // ---- blimp with a blinking banner -------------------------------------------
  const blimp = new T.Group(); blimp.userData.dynamic = true; root.add(blimp);
  const body = sphere(2.6, 0xff7fa8, 0, 0, 0, blimp, [2.1, .9, .9]);
  body.castShadow = false;
  box(1.7, .6, .8, 0x352653, 0, -1.9, 0, blimp); lightBox(1.3, .2, .82, 0x8ef7e6, 0, -1.9, 0, blimp);
  for (const [y, z] of [[1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2]]) { const fin = box(1.4, .12, .9, 0xffcf3d, -5.2, y * .8, z * .8, blimp); fin.rotation.x = z ? Math.PI / 2 : 0; }
  const beacon = mesh(new T.SphereGeometry(.18, 10, 8), 0xff3355, 0, 2.4, 0, blimp, false, true);
  const bannerCanvas = document.createElement('canvas'); bannerCanvas.width = 512; bannerCanvas.height = 128;
  { const k = bannerCanvas.getContext('2d'); k.fillStyle = '#221a3d'; k.fillRect(0, 0, 512, 128); k.fillStyle = '#ffcf3d'; k.font = `1000 64px ${FONT}`; k.textAlign = 'center'; k.textBaseline = 'middle'; k.fillText('★ SECRET LIST ★', 256, 68); }
  const bannerTex = new T.CanvasTexture(bannerCanvas); bannerTex.colorSpace = T.SRGBColorSpace;
  for (const side of [-1, 1]) {
    const banner = new T.Mesh(new T.PlaneGeometry(4.8, 1.2), new T.MeshBasicMaterial({ map: bannerTex, side: T.FrontSide }));
    banner.material.color.setScalar(1.6);
    banner.position.set(0, 0, side * 2.36); if (side < 0) banner.rotation.y = Math.PI; blimp.add(banner);
  }
  const blimpOrbit = { r: 33, y: 16.5, a: 2.2 };
  animated.push((t, dt) => {
    blimpOrbit.a += dt * .018;
    blimp.position.set(Math.cos(blimpOrbit.a) * blimpOrbit.r, blimpOrbit.y + Math.sin(t * .4) * .6, Math.sin(blimpOrbit.a) * blimpOrbit.r);
    blimp.rotation.y = -blimpOrbit.a - Math.PI / 2;
    beacon.visible = Math.sin(t * 5) > .3;
  });

  // ---- searchlights ------------------------------------------------------------
  const beamGeo = new T.ConeGeometry(3.2, 60, 24, 1, true); beamGeo.translate(0, -30, 0);
  const beamMat = new T.ShaderMaterial({
    transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, fog: false,
    uniforms: { color: { value: new T.Color(0x9fb2ff) } },
    vertexShader: 'varying float vH;void main(){vH=-position.y/60.;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'uniform vec3 color;varying float vH;void main(){gl_FragColor=vec4(color*(1.-vH)*(1.-vH)*.2,1.);}'
  });
  const beams = [];
  for (const [x, z, ph] of [[-36, -40, 0], [42, -30, 2.4]]) {
    const b = new T.Mesh(beamGeo, beamMat); b.position.set(x, -8, z); b.renderOrder = -5; scene.add(b); beams.push({ b, ph });
  }
  animated.push(t => { for (const { b, ph } of beams) { b.rotation.set(Math.PI + Math.sin(t * .23 + ph) * .45, 0, Math.cos(t * .19 + ph) * .35); } });

  // ---- falling paper scraps (ambient), one instanced mesh -----------------------
  const scraps = new T.InstancedMesh(new T.PlaneGeometry(.14, .22), new T.MeshBasicMaterial({ color: 0xffffff, side: T.DoubleSide }), 12);
  for (let i = 0; i < 12; i++) scraps.setColorAt(i, new T.Color(i % 2 ? 0xffcf78 : 0xedb6e5));
  scene.add(scraps);
  const sm = new T.Matrix4(), sq = new T.Quaternion(), se = new T.Euler(), sp = new T.Vector3();
  animated.push(t => {
    for (let i = 0; i < 12; i++) {
      const phase = i * 1.7;
      sp.set(Math.sin(t * .1 + phase) * 11, 4.5 + Math.sin(t * .5 + phase), Math.cos(t * .13 + phase) * 10);
      se.set(t * .7 + phase, t * .4, phase); sq.setFromEuler(se);
      scraps.setMatrixAt(i, sm.compose(sp, sq, one));
    }
    scraps.instanceMatrix.needsUpdate = true;
  });

  kit.bakeLocal(blimp, { cast: false });
  const baked = kit.bake(scene);

  let time = 0;
  function update(dt, px) {
    time += dt;
    kit.windowUniforms.time.value = time;
    starMat.uniforms.time.value = time; starMat.uniforms.px.value = px;
    for (const fn of animated) fn(time, dt);
    for (const c of clouds) { c.a += c.speed * dt; c.s.position.x = Math.cos(c.a) * c.r; c.s.position.z = Math.sin(c.a) * c.r; }
    for (const s of signs) {
      let k = s.base;
      if (s.flicker === 1) { const f = Math.sin(time * 1.3 + s.phase) + Math.sin(time * 17.1) * .4; if (f > 1.15) k *= .35; }
      if (s.flicker === 2) k *= .85 + .25 * Math.sin(time * 2.2);
      s.mat.color.setScalar(k);
    }
    const dark = new T.Color(0x3a2c4a);
    for (let i = 0; i < 9; i++) bulbs.setColorAt(i, ((Math.floor(time * 3) + i) % 3) !== 0 ? bulbColors[i] : dark);
    bulbs.instanceColor.needsUpdate = true;
  }

  return { update, glowTexture, softTexture, halo, baked };
}
