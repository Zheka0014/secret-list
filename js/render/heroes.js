// 2.5D heroes: camera-facing cut-outs from the illustration with a procedural
// rig (legs, arms, ears), ink outline + highlight, neon rim light, hit flash,
// silhouette shadows, a shield bubble, dash after-images and fall/launch ghosts.
import { HEROES, ATLAS } from '../config.js';

const MARGIN = .035;

const VERT = `
uniform vec2 size;
uniform float time, stride, pace, facing, punch, dash, hurt, lift, spin, squash, margin;
varying vec2 vArt;
vec2 rotateAt(vec2 p, vec2 pivot, float a){ float c = cos(a), s = sin(a); p -= pivot; return pivot + mat2(c, -s, s, c) * p; }
void main(){
  vec2 p = vec2(position.x * (1. + 2. * margin), (position.y + .5) * (1. + 2. * margin) - margin);
  vArt = vec2(p.x + .5, p.y);
  float side = p.x < 0. ? -1. : 1.;
  float cycle = sin(stride + step(0., p.x) * 3.14159265);
  float leg = (1. - smoothstep(.22, .39, p.y)) * smoothstep(.015, .11, abs(p.x));
  vec2 swung = rotateAt(p, vec2(side * .16, .34), cycle * .42 * pace);
  p = mix(p, swung, leg); p.y += leg * max(0., cycle) * .07 * pace;
  float arm = smoothstep(.22, .40, abs(p.x)) * smoothstep(.25, .40, p.y) * (1. - smoothstep(.58, .72, p.y));
  vec2 reach = rotateAt(p, vec2(side * .28, .62), -cycle * .30 * pace - side * punch * .55);
  p = mix(p, reach, arm); p.x += side * arm * punch * .055;
  float tip = smoothstep(.78, .98, p.y); p.x += tip * sin(time * 4. + side) * (.012 + .035 * pace);
  float bounce = abs(sin(stride)) * .075 * pace, breath = sin(time * 2.8) * .009 * (1. - pace);
  p.y *= 1. + breath + sin(stride * 2.) * .02 * pace - .07 * punch + .06 * dash - squash;
  p.x *= 1. - breath + .05 * punch + squash * .7;
  p.x += sin(stride) * .023 * pace + punch * .10;
  p = rotateAt(p, vec2(0., .1), sin(stride) * .045 * pace - .12 * dash + sin(time * 40.) * .025 * hurt);
  p = rotateAt(p, vec2(0., .45), spin);
  p.x *= facing;
  vec4 center = viewMatrix * modelMatrix * vec4(0., 0., 0., 1.);
  center.xy += p * size; center.y += bounce + lift;
  gl_Position = projectionMatrix * center;
}`;

const FRAG = `
uniform sampler2D art;
uniform vec4 rect;
uniform vec2 texel;
uniform float hurt, alpha, outlinePx, rimAmt, hlAmt, facing, time;
uniform vec3 inkColor, hlColor, tint;
varying vec2 vArt;
float A(vec2 uv){
  vec2 ins = step(vec2(0.), uv) * step(uv, vec2(1.));
  return texture2D(art, rect.xy + clamp(uv, 0., 1.) * rect.zw).a * ins.x * ins.y;
}
void main(){
  vec2 uv = vArt;
  vec2 ins = step(vec2(0.), uv) * step(uv, vec2(1.));
  vec4 c = texture2D(art, rect.xy + clamp(uv, 0., 1.) * rect.zw);
  c.a *= ins.x * ins.y;
  vec2 o = texel * outlinePx;
  float r = A(uv + vec2(o.x, 0.)), l = A(uv - vec2(o.x, 0.)), u = A(uv + vec2(0., o.y)), d = A(uv - vec2(0., o.y));
  float n = max(max(r, l), max(u, d));
  n = max(n, max(max(A(uv + o * .7071), A(uv - o * .7071)), max(A(uv + vec2(o.x, -o.y) * .7071), A(uv + vec2(-o.x, o.y) * .7071))));
  vec2 g = vec2(r - l, u - d);
  vec2 outward = -g / (length(g) + 1e-4);
  outward.x *= facing;
  float edge = c.a * (1. - min(min(r, l), min(u, d)));
  vec3 rim = vec3(.35, .95, 1.0) * max(0., -outward.x) + vec3(1.0, .42, .78) * max(0., outward.x) + vec3(.9, .85, 1.) * max(0., outward.y) * .6;
  vec3 col = c.rgb * tint + rim * edge * rimAmt;
  col = mix(col, vec3(1.), clamp(hurt, 0., 1.) * .6);
  float a = c.a;
  float ol = smoothstep(.12, .5, n) * (1. - a);
  vec3 line = mix(inkColor, hlColor, hlAmt);
  vec3 outCol = col * a + line * ol;
  float outA = (a + ol) * alpha;
  if (outA < .004) discard;
  gl_FragColor = vec4(outCol * alpha, outA);
  #include <colorspace_fragment>
}`;

const DEPTH_FRAG = `
#include <packing>
uniform sampler2D art;
uniform vec4 rect;
varying vec2 vArt;
void main(){
  if (vArt.x < 0. || vArt.x > 1. || vArt.y < 0. || vArt.y > 1.) discard;
  if (texture2D(art, rect.xy + vArt * rect.zw).a < .5) discard;
  gl_FragColor = packDepthToRGBA(gl_FragCoord.z);
}`;

// X-ray pass: drawn only where the hero is hidden behind scenery (depth test
// GREATER against the opaque world, before the heroes themselves are drawn),
// so you never lose yourself or your target behind a shop. Feet are skipped:
// they sink a few centimetres into the floor tiles.
const XRAY_FRAG = `
uniform sampler2D art;
uniform vec4 rect;
uniform vec3 xrayColor;
uniform float xrayAlpha, alpha;
varying vec2 vArt;
void main(){
  if (vArt.x < 0. || vArt.x > 1. || vArt.y < .12 || vArt.y > 1.) discard;
  if (texture2D(art, rect.xy + vArt * rect.zw).a < .5) discard;
  float stripe = step(.5, fract((gl_FragCoord.x + gl_FragCoord.y) * .125));
  float a = xrayAlpha * alpha * (.72 + .28 * stripe);
  gl_FragColor = vec4(xrayColor * a, a);
  #include <colorspace_fragment>
}`;

export function heroRectUV(i) {
  const [x, y, w, h] = HEROES[i].rect;
  return [x / ATLAS.width, 1 - (y + h) / ATLAS.height, w / ATLAS.width, h / ATLAS.height];
}

export function createHeroFactory(T, texture, { shadows = true } = {}) {
  const plane = new T.PlaneGeometry(1, 1, 30, 42);
  const shieldGeo = new T.SphereGeometry(1.15, 28, 18);
  const blobTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const k = c.getContext('2d'), g = k.createRadialGradient(32, 32, 3, 32, 32, 31);
    g.addColorStop(0, 'rgba(20,14,40,.72)'); g.addColorStop(.55, 'rgba(20,14,40,.32)'); g.addColorStop(1, 'rgba(20,14,40,0)');
    k.fillStyle = g; k.fillRect(0, 0, 64, 64);
    return new T.CanvasTexture(c);
  })();
  const blobMat = new T.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const blobGeo = new T.PlaneGeometry(1.9, 1.5);

  function makeUniforms(heroIndex) {
    const [, , w, h] = HEROES[heroIndex].rect;
    return {
      art: { value: texture }, rect: { value: new T.Vector4(...heroRectUV(heroIndex)) },
      size: { value: new T.Vector2(HEROES[heroIndex].height * w / h, HEROES[heroIndex].height) },
      texel: { value: new T.Vector2(1 / w, 1 / h) }, margin: { value: MARGIN },
      time: { value: 0 }, stride: { value: 0 }, pace: { value: 0 }, facing: { value: 1 }, punch: { value: 0 }, dash: { value: 0 }, hurt: { value: 0 },
      lift: { value: 0 }, spin: { value: 0 }, squash: { value: 0 },
      alpha: { value: 1 }, outlinePx: { value: 7 }, rimAmt: { value: .55 }, hlAmt: { value: 0 },
      inkColor: { value: new T.Color(0x221a3d) }, hlColor: { value: new T.Color(0xffcf3d) }, tint: { value: new T.Color(1, 1, 1) },
      xrayColor: { value: new T.Color(0xbfaefc) }, xrayAlpha: { value: .5 }
    };
  }
  function setHeroUniforms(u, heroIndex) {
    const [, , w, h] = HEROES[heroIndex].rect;
    u.rect.value.set(...heroRectUV(heroIndex));
    u.size.value.set(HEROES[heroIndex].height * w / h, HEROES[heroIndex].height);
    u.texel.value.set(1 / w, 1 / h);
  }
  // DoubleSide: the vertex shader mirrors the quad (p.x *= facing) to turn the
  // hero around, which flips the triangle winding. With the default FrontSide
  // every hero walking left on screen was culled and vanished. The shadow pass
  // derives its side from this material too, so shadows now work both ways.
  function makeMaterial(u) {
    const m = new T.ShaderMaterial({ uniforms: u, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: true, premultipliedAlpha: true, blending: T.NormalBlending, side: T.DoubleSide });
    return m;
  }
  function makeDepthMaterial(u) {
    return new T.ShaderMaterial({ uniforms: u, vertexShader: VERT, fragmentShader: DEPTH_FRAG });
  }
  function makeXrayMaterial(u) {
    return new T.ShaderMaterial({ uniforms: u, vertexShader: VERT, fragmentShader: XRAY_FRAG, transparent: true, depthWrite: false, depthTest: true, depthFunc: T.GreaterDepth, premultipliedAlpha: true, blending: T.NormalBlending, side: T.DoubleSide });
  }

  function shieldMaterial() {
    return new T.ShaderMaterial({
      transparent: true, depthWrite: false, blending: T.AdditiveBlending,
      uniforms: { color: { value: new T.Color(0x98fbef) }, time: { value: 0 }, amount: { value: 1 } },
      vertexShader: 'varying vec3 vN;varying vec3 vV;varying vec3 vP;void main(){vN=normalize(normalMatrix*normal);vec4 mv=modelViewMatrix*vec4(position,1.);vV=normalize(-mv.xyz);vP=position;gl_Position=projectionMatrix*mv;}',
      fragmentShader: 'uniform vec3 color;uniform float time;uniform float amount;varying vec3 vN;varying vec3 vV;varying vec3 vP;void main(){float f=pow(1.-abs(dot(vN,vV)),2.2);float bands=.5+.5*sin(vP.y*9.+time*5.);float hex=step(.86,fract(vP.x*3.+vP.y*1.7))+step(.86,fract(vP.x*-3.+vP.y*1.7));gl_FragColor=vec4(color*(f*.85+(bands*.1+hex*.14)*f+.02)*amount,1.);}'
    });
  }

  class Actor {
    constructor(heroIndex) {
      this.hero = heroIndex;
      this.group = new T.Group();
      this.u = makeUniforms(heroIndex);
      this.sprite = new T.Mesh(plane, makeMaterial(this.u));
      this.sprite.frustumCulled = false;
      this.sprite.castShadow = shadows;
      this.sprite.customDepthMaterial = makeDepthMaterial(this.u);
      this.sprite.renderOrder = 2;
      this.group.add(this.sprite);
      this.xray = new T.Mesh(plane, makeXrayMaterial(this.u));
      this.xray.frustumCulled = false; this.xray.renderOrder = 1;
      this.group.add(this.xray);
      this.shieldMat = shieldMaterial();
      this.shield = new T.Mesh(shieldGeo, this.shieldMat);
      this.shield.position.y = 1.6; this.shield.scale.set(1, 1.5, 1); this.shield.visible = false; this.shield.renderOrder = 3;
      this.group.add(this.shield);
      this.blob = new T.Mesh(blobGeo, blobMat);
      this.blob.rotation.x = -Math.PI / 2; this.blob.position.y = .245;
      this.motion = { lastX: null, lastZ: null, time: Math.random() * 10, stride: 0, pace: 0, facing: 1, state: 'idle' };
      this.shownHero = heroIndex;
    }
    showHero(i) { if (i !== this.shownHero) { this.shownHero = i; setHeroUniforms(this.u, i); } }
    // p: view player ({x,z,dead,caught,dashT,attackT,hitAge,shield,disguiseHero,...})
    animate(p, dt, active, cameraRight) {
      const m = this.motion, u = this.u;
      if (m.lastX === null) { m.lastX = p.x; m.lastZ = p.z; }
      const dx = p.x - m.lastX, dz = p.z - m.lastZ;
      m.lastX = p.x; m.lastZ = p.z;
      m.time += dt;
      u.time.value = m.time;
      this.shieldMat.uniforms.time.value = m.time;
      if (!active) return;
      const teleport = Math.hypot(dx, dz) > 2.5;
      const speed = dt > 0 && !teleport ? Math.hypot(dx, dz) / dt : 0;
      m.pace += (Math.min(speed / 3.4, 1) - m.pace) * (1 - Math.exp(-dt * 14));
      if (p.dead > 0 || p.caught > 0) m.pace = 0;
      m.stride += dt * (m.pace > .05 ? 10 + Math.min(speed, 8) : 0);
      const screenDir = dx * cameraRight.x + dz * cameraRight.z;
      if (!teleport && Math.abs(screenDir) > .004) m.facing = screenDir < 0 ? -1 : 1;
      m.state = p.dead > 0 ? 'out' : p.caught > 0 ? 'trapped' : p.dashT > 3.5 ? 'dash' : p.attackT > .75 ? 'attack' : m.pace > .12 ? 'walk' : 'idle';
      u.stride.value = m.stride; u.pace.value = m.pace; u.facing.value = m.facing;
      u.punch.value = p.attackT > .75 ? Math.sin((1.05 - p.attackT) / .3 * Math.PI) : 0;
      u.dash.value = p.dashT > 3.5 ? (p.dashT - 3.5) * 2 : 0;
      u.hurt.value = p.hitAge > 2.65 ? (p.hitAge - 2.65) / .35 : 0;
      u.squash.value = p.caught > 0 ? .06 + Math.sin(m.time * 30) * .02 : 0;
    }
  }

  // Short-lived copies of a hero: dash after-images, falls, spring launches.
  const ghosts = [];
  const pool = [];
  function spawnGhost(scene, heroIndex, x, z, opts) {
    let g = pool.pop();
    if (!g) {
      const u = makeUniforms(heroIndex);
      const mesh = new T.Mesh(plane, makeMaterial(u)); mesh.frustumCulled = false; mesh.renderOrder = 1;
      g = { mesh, u };
    }
    setHeroUniforms(g.u, heroIndex);
    Object.assign(g, { age: 0, life: 1, vx: 0, vy: 0, vz: 0, y: 0, spin: 0, spinV: 0, mode: 'still' }, opts);
    g.alpha0 = opts.alpha ?? 1;
    g.u.facing.value = opts.facing ?? 1; g.u.pace.value = opts.pace ?? 0; g.u.stride.value = opts.stride ?? 0;
    g.u.tint.value.set(opts.tint ?? 0xffffff); g.u.rimAmt.value = opts.rim ?? .55; g.u.hlAmt.value = 0;
    g.u.outlinePx.value = opts.outline ?? 7; g.u.alpha.value = opts.alpha ?? 1; g.u.lift.value = 0; g.u.spin.value = 0;
    g.u.hurt.value = opts.hurt ?? 0;
    g.mesh.position.set(x, 0, z);
    scene.add(g.mesh);
    ghosts.push(g);
    return g;
  }
  function updateGhosts(dt, onDone) {
    for (let i = ghosts.length - 1; i >= 0; i--) {
      const g = ghosts[i];
      g.age += dt;
      const k = g.age / g.life;
      if (k >= 1) {
        g.mesh.parent?.remove(g.mesh); ghosts.splice(i, 1); pool.push(g);
        onDone?.(g);
        continue;
      }
      if (g.mode !== 'still') {
        g.vy -= (g.mode === 'spring' ? 20 : 26) * dt;
        g.mesh.position.x += g.vx * dt; g.mesh.position.z += g.vz * dt; g.y += g.vy * dt;
        g.spin += g.spinV * dt;
      }
      g.u.lift.value = g.y; g.u.spin.value = g.spin;
      g.u.alpha.value = g.alpha0 * (g.mode === 'still' ? 1 - k : k > .8 ? (1 - k) / .2 : 1);
      g.u.time.value += dt;
    }
  }

  return { Actor, spawnGhost, updateGhosts, blobMat, heroRectUV };
}
