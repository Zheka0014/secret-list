// Particle effects. Two point systems (additive sparks, alpha-blended puffs and
// confetti) plus pooled floor rings and light beams: a handful of draw calls
// no matter how chaotic the rooftop gets.
const VERT = `
attribute vec3 color;
attribute float size;
attribute float alpha;
attribute float shape;
attribute float angle;
uniform float scale;
varying vec3 vColor; varying float vAlpha; varying float vShape; varying float vAngle;
void main(){
  vColor = color; vAlpha = alpha; vShape = shape; vAngle = angle;
  vec4 mv = modelViewMatrix * vec4(position, 1.);
  gl_PointSize = clamp(size * scale / max(-mv.z, .1), 1., 256.);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
uniform float additive;
varying vec3 vColor; varying float vAlpha; varying float vShape; varying float vAngle;
void main(){
  vec2 p = gl_PointCoord - .5;
  float a;
  if (vShape < .5) a = smoothstep(.5, .0, length(p));
  else if (vShape < 1.5) { vec2 d = abs(p); a = smoothstep(.5, .1, length(p)) * (.25 + .75 * max(smoothstep(.09, .0, d.x), smoothstep(.09, .0, d.y))) + smoothstep(.16, .0, length(p)); }
  else if (vShape < 2.5) { float c = cos(vAngle), s = sin(vAngle); vec2 q = mat2(c, -s, s, c) * p; a = step(abs(q.x), .36) * step(abs(q.y), .2); }
  else a = smoothstep(.12, .0, abs(length(p) - .36));
  a *= vAlpha;
  if (a < .003) discard;
  gl_FragColor = additive > .5 ? vec4(vColor * a, 1.) : vec4(vColor, a);
}`;

class PointSystem {
  constructor(T, max, additive) {
    this.max = max; this.n = 0;
    this.px = new Float32Array(max); this.py = new Float32Array(max); this.pz = new Float32Array(max);
    this.vx = new Float32Array(max); this.vy = new Float32Array(max); this.vz = new Float32Array(max);
    this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max); this.s1 = new Float32Array(max);
    this.cr = new Float32Array(max); this.cg = new Float32Array(max); this.cb = new Float32Array(max);
    this.grav = new Float32Array(max); this.drag = new Float32Array(max); this.shp = new Float32Array(max);
    this.ang = new Float32Array(max); this.angV = new Float32Array(max); this.a0 = new Float32Array(max);
    const g = new T.BufferGeometry();
    this.aPos = new T.BufferAttribute(new Float32Array(max * 3), 3).setUsage(T.DynamicDrawUsage);
    this.aCol = new T.BufferAttribute(new Float32Array(max * 3), 3).setUsage(T.DynamicDrawUsage);
    this.aSize = new T.BufferAttribute(new Float32Array(max), 1).setUsage(T.DynamicDrawUsage);
    this.aAlpha = new T.BufferAttribute(new Float32Array(max), 1).setUsage(T.DynamicDrawUsage);
    this.aShape = new T.BufferAttribute(new Float32Array(max), 1).setUsage(T.DynamicDrawUsage);
    this.aAngle = new T.BufferAttribute(new Float32Array(max), 1).setUsage(T.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('color', this.aCol); g.setAttribute('size', this.aSize);
    g.setAttribute('alpha', this.aAlpha); g.setAttribute('shape', this.aShape); g.setAttribute('angle', this.aAngle);
    g.setDrawRange(0, 0);
    this.uniforms = { scale: { value: 400 }, additive: { value: additive ? 1 : 0 } };
    this.material = new T.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
      blending: additive ? T.AdditiveBlending : T.NormalBlending
    });
    this.points = new T.Points(g, this.material);
    this.points.frustumCulled = false; this.points.renderOrder = additive ? 6 : 5;
    this.geometry = g;
    this.tmp = new T.Color();
  }
  spawn(x, y, z, vx, vy, vz, o) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.px[i] = x; this.py[i] = y; this.pz[i] = z; this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.life[i] = this.maxLife[i] = o.life ?? 1;
    this.s0[i] = o.size ?? .3; this.s1[i] = o.size1 ?? (o.size ?? .3) * .2;
    this.tmp.set(o.color ?? 0xffffff);
    const k = o.intensity ?? 1;
    this.cr[i] = this.tmp.r * k; this.cg[i] = this.tmp.g * k; this.cb[i] = this.tmp.b * k;
    this.grav[i] = o.gravity ?? 0; this.drag[i] = o.drag ?? 1.5; this.shp[i] = o.shape ?? 0;
    this.ang[i] = o.angle ?? Math.random() * 6.28; this.angV[i] = o.spin ?? 0; this.a0[i] = o.alpha ?? 1;
  }
  update(dt) {
    let w = 0;
    const P = this.aPos.array, C = this.aCol.array, S = this.aSize.array, A = this.aAlpha.array, SH = this.aShape.array, AN = this.aAngle.array;
    for (let i = 0; i < this.n; i++) {
      const life = this.life[i] - dt;
      if (life <= 0) continue;
      const damp = Math.exp(-this.drag[i] * dt);
      let vx = this.vx[i] * damp, vy = this.vy[i] * damp - this.grav[i] * dt, vz = this.vz[i] * damp;
      let x = this.px[i] + vx * dt, y = this.py[i] + vy * dt, z = this.pz[i] + vz * dt;
      if (y < .26 && vy < 0 && this.grav[i] > 0 && Math.abs(x) < 12.7 && Math.abs(z) < 11.7) { y = .26; vy *= -.35; vx *= .7; vz *= .7; }
      const t = 1 - life / this.maxLife[i];
      if (w !== i) {
        this.px[w] = x; this.py[w] = y; this.pz[w] = z; this.vx[w] = vx; this.vy[w] = vy; this.vz[w] = vz;
        this.life[w] = life; this.maxLife[w] = this.maxLife[i]; this.s0[w] = this.s0[i]; this.s1[w] = this.s1[i];
        this.cr[w] = this.cr[i]; this.cg[w] = this.cg[i]; this.cb[w] = this.cb[i]; this.grav[w] = this.grav[i];
        this.drag[w] = this.drag[i]; this.shp[w] = this.shp[i]; this.ang[w] = this.ang[i] + this.angV[i] * dt; this.angV[w] = this.angV[i]; this.a0[w] = this.a0[i];
      } else {
        this.px[w] = x; this.py[w] = y; this.pz[w] = z; this.vx[w] = vx; this.vy[w] = vy; this.vz[w] = vz; this.life[w] = life; this.ang[w] += this.angV[w] * dt;
      }
      P[w * 3] = x; P[w * 3 + 1] = y; P[w * 3 + 2] = z;
      C[w * 3] = this.cr[w]; C[w * 3 + 1] = this.cg[w]; C[w * 3 + 2] = this.cb[w];
      S[w] = this.s0[w] + (this.s1[w] - this.s0[w]) * t;
      A[w] = this.a0[w] * (t < .1 ? t / .1 : 1) * (1 - t * t);
      SH[w] = this.shp[w]; AN[w] = this.ang[w];
      w++;
    }
    this.n = w;
    this.geometry.setDrawRange(0, w);
    for (const a of [this.aPos, this.aCol, this.aSize, this.aAlpha, this.aShape, this.aAngle]) { a.needsUpdate = true; a.clearUpdateRanges?.(); a.addUpdateRange?.(0, w * a.itemSize); }
  }
}

export function createFX(T, scene, quality) {
  const glow = new PointSystem(T, quality.particles, true);
  const soft = new PointSystem(T, Math.round(quality.particles * .6), false);
  scene.add(glow.points, soft.points);
  const density = quality.particleDensity;
  const R = Math.random;
  const n = c => Math.max(1, Math.round(c * density));

  // Floor rings: soft additive annulus that expands and fades.
  const ringGeo = new T.PlaneGeometry(1, 1);
  const ringVert = 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}';
  const ringFrag = 'uniform vec3 color;uniform float alpha;uniform float width;varying vec2 vUv;void main(){float d=length(vUv-.5)*2.;float a=smoothstep(width,0.,abs(d-.86))*alpha;gl_FragColor=vec4(color*a,1.);}';
  const rings = [], ringPool = [];
  function ring(x, y, z, color, r0, r1, life, width = .12, intensity = 2.2) {
    let m = ringPool.pop();
    if (!m) {
      m = new T.Mesh(ringGeo, new T.ShaderMaterial({ uniforms: { color: { value: new T.Color() }, alpha: { value: 1 }, width: { value: .1 } }, vertexShader: ringVert, fragmentShader: ringFrag, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
      m.rotation.x = -Math.PI / 2; m.renderOrder = 4;
    }
    m.material.uniforms.color.value.set(color).multiplyScalar(intensity);
    m.material.uniforms.width.value = width;
    m.position.set(x, y, z);
    scene.add(m);
    rings.push({ m, r0, r1, life, age: 0 });
  }
  // Vertical light beam (respawn, trap fire).
  const beamGeo = new T.CylinderGeometry(1, 1, 1, 24, 1, true); beamGeo.translate(0, .5, 0);
  const beamFrag = 'uniform vec3 color;uniform float alpha;varying vec2 vUv;void main(){float a=(1.-vUv.y)*(1.-vUv.y)*alpha;gl_FragColor=vec4(color*a,1.);}';
  const beams = [], beamPool = [];
  function beam(x, z, color, radius, height, life, intensity = 1.6) {
    let m = beamPool.pop();
    if (!m) {
      m = new T.Mesh(beamGeo, new T.ShaderMaterial({ uniforms: { color: { value: new T.Color() }, alpha: { value: 1 } }, vertexShader: ringVert, fragmentShader: beamFrag, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide }));
      m.renderOrder = 4;
    }
    m.material.uniforms.color.value.set(color).multiplyScalar(intensity);
    m.position.set(x, 0, z); m.scale.set(radius, height, radius);
    scene.add(m);
    beams.push({ m, life, age: 0, radius });
  }

  function sparks(x, y, z, count, color, speed = 6, up = 3, o = {}) {
    for (let i = 0; i < n(count); i++) {
      const a = R() * 6.283, s = speed * (.35 + R() * .65);
      glow.spawn(x, y, z, Math.cos(a) * s, up * (.4 + R()), Math.sin(a) * s, { life: .35 + R() * .45, size: o.size ?? .22, size1: .02, color, intensity: o.intensity ?? 3, gravity: o.gravity ?? 9, drag: 2.2, shape: o.shape ?? 0 });
    }
  }
  function puffs(x, y, z, count, color, o = {}) {
    for (let i = 0; i < n(count); i++) {
      const a = R() * 6.283, s = (o.speed ?? 1.6) * (.3 + R());
      soft.spawn(x + Math.cos(a) * .3, y + R() * .3, z + Math.sin(a) * .3, Math.cos(a) * s, (o.up ?? 1.2) * (.5 + R()), Math.sin(a) * s,
        { life: (o.life ?? .9) * (.7 + R() * .6), size: o.size ?? .9, size1: (o.size ?? .9) * 2.1, color, alpha: o.alpha ?? .55, drag: 2.5, gravity: -(o.rise ?? .4) });
    }
  }
  function confetti(x, y, z, count) {
    const cols = [0xffcf3d, 0xff6fa8, 0x6ff2e0, 0xb58cff, 0xffffff, 0x9dff72];
    for (let i = 0; i < n(count); i++) {
      const a = R() * 6.283, s = 2 + R() * 4;
      soft.spawn(x, y, z, Math.cos(a) * s, 5 + R() * 5, Math.sin(a) * s, { life: 1.4 + R() * .8, size: .32, size1: .28, color: cols[i % cols.length], alpha: 1, gravity: 9, drag: 1.4, shape: 2, spin: (R() - .5) * 14 });
    }
  }

  const TRAP_FX = {
    pulse: t => { ring(t.x, .32, t.z, 0xffcf3d, .5, 3.4, .5, .1, 3); sparks(t.x, .5, t.z, 26, 0xffd35a, 7, 5); beam(t.x, t.z, 0xffcf3d, 1.2, 5, .5); },
    spring: t => { ring(t.x, .32, t.z, 0xffa83d, .5, 2.6, .45); sparks(t.x, .6, t.z, 30, 0xffb35a, 3, 14, { gravity: 14 }); },
    cage: t => { ring(t.x, .32, t.z, 0xc798ff, 2.4, .6, .45, .14, 2.6); sparks(t.x, 2.8, t.z, 20, 0xd6b3ff, 4, 1); puffs(t.x, .3, t.z, 8, 0x8b7bb8, { size: .7 }); },
    ice: t => { ring(t.x, .32, t.z, 0x67e9ff, .4, 2.8, .7, .16, 2.4); sparks(t.x, .4, t.z, 24, 0xb5f6ff, 3, 4, { shape: 1, size: .3 }); puffs(t.x, .2, t.z, 10, 0xc9f4ff, { size: 1, alpha: .35, rise: .1 }); }
  };

  const api = {
    attack(x, z, mine) { ring(x, .3, z, mine ? 0xffcf3d : 0xffffff, .4, 2.35, .3, .09, mine ? 2.6 : 1.6); },
    hit(x, z) { sparks(x, 1.4, z, 12, 0xfff1b0, 7, 3, { size: .2 }); sparks(x, 1.4, z, 4, 0xffffff, 3, 2, { shape: 1, size: .5 }); },
    dash(x, z, color) { puffs(x, .25, z, 6, 0xb8a9d9, { size: .55, speed: 1.2, up: .4, life: .6, alpha: .45 }); sparks(x, .8, z, 6, color, 2, 1, { size: .16 }); },
    elim(x, z, color, y = 1.3) {
      sparks(x, y, z, 30, color, 7, 6, { intensity: 3.2 });
      sparks(x, y, z, 8, 0xffffff, 4, 5, { shape: 1, size: .55, gravity: 4 });
      puffs(x, y - .6, z, 14, 0x9c8ccc, { size: 1.1, speed: 2.4, up: 1.4, alpha: .6 });
      ring(x, .3, z, color, .4, 2.8, .45, .12, 2);
    },
    order(x, z) {
      confetti(x, 2.6, z, 46);
      sparks(x, 2.8, z, 14, 0xffe27a, 4, 6, { shape: 1, size: .6, gravity: 5 });
      ring(x, .3, z, 0xffcf3d, .6, 3.6, .8, .12, 3);
    },
    respawn(x, z, color) { beam(x, z, color, .9, 9, .9, 2); ring(x, .3, z, color, 2.4, .7, .6, .12, 2.4); sparks(x, .4, z, 16, color, 1.5, 7, { gravity: -1, shape: 1, size: .3 }); },
    trapArm(t) { sparks(t.x, .4, t.z, 10, 0xffe27a, 1.2, 3, { gravity: -2 }); ring(t.x, .31, t.z, 0xffcf3d, 1.3, 1.0, .9, .1, 1.6); },
    trapFire(t) { TRAP_FX[t.type]?.(t); },
    mask(x, z) { puffs(x, .8, z, 18, 0xbc91ff, { size: 1.2, speed: 2, up: 1.5, alpha: .7 }); sparks(x, 1.5, z, 10, 0xe3cfff, 3, 3, { shape: 1, size: .4 }); },
    splash(x, z, color) { sparks(x, -1.2, z, 16, color, 4, 3); puffs(x, -1.4, z, 6, 0x9c8ccc, { size: 1.4, alpha: .5 }); },
    steam(x, y, z) { soft.spawn(x + (R() - .5) * .6, y, z + (R() - .5) * .6, (R() - .5) * .3, 1.1 + R() * .4, (R() - .5) * .3, { life: 2.6, size: .8, size1: 2.6, color: 0xe8defa, alpha: .22, drag: .6, gravity: -.1 }); },
    footstep(x, z) { soft.spawn(x + (R() - .5) * .4, .3, z + (R() - .5) * .4, (R() - .5) * .5, .4, (R() - .5) * .5, { life: .45, size: .35, size1: .8, color: 0xb9acd9, alpha: .3, drag: 3 }); },
    ring, beam, sparks, puffs, confetti,
    setScale(s) { glow.uniforms.scale.value = s; soft.uniforms.scale.value = s; },
    update(dt) {
      glow.update(dt); soft.update(dt);
      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i]; r.age += dt; const k = r.age / r.life;
        if (k >= 1) { scene.remove(r.m); ringPool.push(r.m); rings.splice(i, 1); continue; }
        const e = 1 - Math.pow(1 - k, 2.2), s = (r.r0 + (r.r1 - r.r0) * e) * 2 / .86;
        r.m.scale.set(s, s, 1); r.m.material.uniforms.alpha.value = 1 - k;
      }
      for (let i = beams.length - 1; i >= 0; i--) {
        const b = beams[i]; b.age += dt; const k = b.age / b.life;
        if (k >= 1) { scene.remove(b.m); beamPool.push(b.m); beams.splice(i, 1); continue; }
        b.m.material.uniforms.alpha.value = (1 - k) * (k < .1 ? k / .1 : 1);
        const s = b.radius * (1 - k * .5); b.m.scale.x = b.m.scale.z = s;
      }
    },
    clear() {
      glow.n = 0; soft.n = 0; glow.update(0); soft.update(0);
      for (const r of rings) { scene.remove(r.m); ringPool.push(r.m); } rings.length = 0;
      for (const b of beams) { scene.remove(b.m); beamPool.push(b.m); } beams.length = 0;
    }
  };
  return api;
}
