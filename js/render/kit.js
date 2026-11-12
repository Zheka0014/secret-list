// Scene-building kit. Props are authored as ordinary meshes and then baked into
// a handful of merged meshes (toon, glow, unlit, backdrop, window lights and one
// ink-outline hull). The original arena used ~1 400 draw calls (+ the same again
// for shadows); after baking it is about a dozen.
export const INK = 0x221a3d;

export function createKit(T) {
  const gradient = new T.DataTexture(new Uint8Array([60, 155, 255]), 3, 1, T.RedFormat);
  gradient.minFilter = T.NearestFilter; gradient.magFilter = T.NearestFilter; gradient.needsUpdate = true;

  const materials = new Map();
  function toon(color, glow = false) {
    const key = color + ':' + glow;
    if (!materials.has(key)) materials.set(key, new T.MeshToonMaterial({ color, gradientMap: gradient, emissive: glow ? color : 0, emissiveIntensity: glow ? 3.3 : 0 }));
    return materials.get(key);
  }
  function basic(color) {
    const key = 'b:' + color;
    if (!materials.has(key)) materials.set(key, new T.MeshBasicMaterial({ color }));
    return materials.get(key);
  }

  // Ink hull: pushes vertices along smoothed normals by a screen-constant width.
  const outlineUniforms = { outlineWidth: { value: .0021 } };
  function makeOutlineMaterial(color = INK) {
    const m = new T.MeshBasicMaterial({ color, side: T.BackSide });
    m.onBeforeCompile = shader => {
      shader.uniforms.outlineWidth = outlineUniforms.outlineWidth;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 onormal;\nuniform float outlineWidth;')
        .replace('#include <project_vertex>', '#include <project_vertex>\n  vec3 hullN = normalize(normalMatrix * onormal);\n  mvPosition.xyz += hullN * outlineWidth * max(-mvPosition.z, 2.0);\n  gl_Position = projectionMatrix * mvPosition;');
    };
    m.customProgramCacheKey = () => 'ink-hull';
    return m;
  }
  const outlineMaterial = makeOutlineMaterial();

  const root = new T.Group();
  root.name = 'kit-root';

  function mesh(geo, color, x = 0, y = 0, z = 0, parent = root, outline = true, glow = false) {
    const m = new T.Mesh(geo, toon(color, glow));
    m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    m.userData.kit = { color, glow, outline };
    parent.add(m);
    return m;
  }

  const geoCache = new Map();
  const cached = (key, make) => { if (!geoCache.has(key)) geoCache.set(key, make()); return geoCache.get(key); };

  function boxGeometry(w, h, d, rounded) {
    return cached(['box', w, h, d, rounded].join(':'), () => {
      if (!(rounded && Math.min(w, h, d) > .19)) return new T.BoxGeometry(w, h, d);
      const r = Math.min(.12, w * .12, h * .12, d * .12), s = new T.Shape();
      s.moveTo(-w / 2 + r, -h / 2); s.lineTo(w / 2 - r, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
      s.lineTo(w / 2, h / 2 - r); s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2); s.lineTo(-w / 2 + r, h / 2);
      s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r); s.lineTo(-w / 2, -h / 2 + r); s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
      const g = new T.ExtrudeGeometry(s, { depth: d - 2 * r, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: r * .4, bevelThickness: r, curveSegments: 3 });
      g.translate(0, 0, -d / 2 + r);
      return g;
    });
  }
  const box = (w, h, d, c, x, y, z, p = root, o = true) => mesh(boxGeometry(w, h, d, o), c, x, y, z, p, o);
  function sphere(r, c, x, y, z, p = root, scale, segs = r > .5 ? 24 : 14) {
    const m = mesh(cached(`sph:${r}:${segs}`, () => new T.SphereGeometry(r, segs, Math.max(8, segs * 2 / 3 | 0))), c, x, y, z, p);
    if (scale) m.scale.set(...scale);
    return m;
  }
  const cylinder = (r1, r2, h, c, x, y, z, p = root, segs = 12) => mesh(cached(`cyl:${r1}:${r2}:${h}:${segs}`, () => new T.CylinderGeometry(r1, r2, h, segs)), c, x, y, z, p);
  function ring(r, c, x, y, z, p = root, tube = .055) {
    const m = new T.Mesh(cached(`tor:${r}:${tube}`, () => new T.TorusGeometry(r, tube, 6, Math.max(24, r * 18 | 0))), basic(c));
    m.rotation.x = -Math.PI / 2; m.position.set(x, y, z);
    m.userData.kit = { color: c, basic: true };
    p.add(m);
    return m;
  }
  const lightBox = (w, h, d, color, x, y, z, p = root) => mesh(cached(`lb:${w}:${h}:${d}`, () => new T.BoxGeometry(w, h, d)), color, x, y, z, p, false, true);

  // ---- baking -------------------------------------------------------------
  const v = new T.Vector3(), n = new T.Vector3(), nm = new T.Matrix3(), col = new T.Color();
  class Acc {
    constructor() { this.pos = []; this.nor = []; this.col = []; this.extra = []; }
    add(geometry, matrix, color, extra) {
      const g = geometry.index ? geometry.toNonIndexed() : geometry;
      const P = g.attributes.position, N = g.attributes.normal;
      nm.getNormalMatrix(matrix);
      col.set(color);
      for (let i = 0; i < P.count; i++) {
        v.fromBufferAttribute(P, i).applyMatrix4(matrix); this.pos.push(v.x, v.y, v.z);
        n.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); this.nor.push(n.x, n.y, n.z);
        this.col.push(col.r, col.g, col.b);
        if (extra !== undefined) this.extra.push(extra);
      }
    }
    geometry(extraName) {
      if (!this.pos.length) return null;
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(this.pos, 3));
      g.setAttribute('normal', new T.Float32BufferAttribute(this.nor, 3));
      g.setAttribute('color', new T.Float32BufferAttribute(this.col, 3));
      if (extraName) g.setAttribute(extraName, new T.Float32BufferAttribute(this.extra, 1));
      g.computeBoundingSphere();
      return g;
    }
  }

  function hullData(geometry, matrix) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    const P = g.attributes.position, N = g.attributes.normal, count = P.count;
    const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), keys = new Array(count), sums = new Map();
    if (matrix) nm.getNormalMatrix(matrix);
    for (let i = 0; i < count; i++) {
      v.fromBufferAttribute(P, i); if (matrix) v.applyMatrix4(matrix);
      n.fromBufferAttribute(N, i); if (matrix) n.applyMatrix3(nm); n.normalize();
      pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
      nor[i * 3] = n.x; nor[i * 3 + 1] = n.y; nor[i * 3 + 2] = n.z;
      const key = Math.round(v.x * 1e4) + ',' + Math.round(v.y * 1e4) + ',' + Math.round(v.z * 1e4);
      keys[i] = key;
      const s = sums.get(key);
      if (s) { s[0] += n.x; s[1] += n.y; s[2] += n.z; } else sums.set(key, [n.x, n.y, n.z]);
    }
    const on = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const s = sums.get(keys[i]), l = Math.hypot(s[0], s[1], s[2]);
      if (l > 1e-5) { on[i * 3] = s[0] / l; on[i * 3 + 1] = s[1] / l; on[i * 3 + 2] = s[2] / l; }
      else { on[i * 3] = nor[i * 3]; on[i * 3 + 1] = nor[i * 3 + 1]; on[i * 3 + 2] = nor[i * 3 + 2]; }
    }
    return { pos, on };
  }
  const hullCache = new Map();
  function hullGeometry(geometry) {
    if (hullCache.has(geometry)) return hullCache.get(geometry);
    const { pos, on } = hullData(geometry, null), g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    g.setAttribute('onormal', new T.BufferAttribute(on, 3));
    g.computeBoundingSphere();
    hullCache.set(geometry, g);
    return g;
  }
  function addHull(m) {
    const o = new T.Mesh(hullGeometry(m.geometry), outlineMaterial);
    o.name = 'hull'; o.userData.hull = true; o.raycast = () => {};
    m.add(o);
    return o;
  }

  const isDynamic = o => { for (let p = o; p; p = p.parent) if (p.userData.dynamic) return true; return false; };

  const windowUniforms = { time: { value: 0 } };
  function windowMaterial() {
    const m = new T.MeshBasicMaterial({ vertexColors: true });
    m.color.setScalar(3.4);
    m.onBeforeCompile = shader => {
      shader.uniforms.time = windowUniforms.time;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float phase;\nuniform float time;\nvarying float vLit;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
  float slot = floor(time * .07 + phase * 13.0);
  float on = step(.22, fract(sin(slot * 12.9898 + phase * 78.233) * 43758.5453));
  float flicker = phase > .93 ? .55 + .45 * step(.5, fract(sin(floor(time * 9.0) + phase * 311.0) * 9631.7)) : 1.0;
  vLit = mix(.08, 1.0, on) * flicker;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vLit;')
        .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb *= vLit;');
    };
    m.customProgramCacheKey = () => 'window-lights';
    return m;
  }

  // Merge the rigid contents of a moving group (blimp, trap decorations, cages)
  // into a few local meshes; the group itself can still move, rotate and scale.
  function bakeLocal(group, { cast = true } = {}) {
    group.updateMatrixWorld(true);
    const inv = new T.Matrix4().copy(group.matrixWorld).invert(), m = new T.Matrix4();
    const toonAcc = new Acc(), glowAcc = new Acc(), basicAcc = new Acc(), hullPos = [], hullOn = [], remove = [];
    const nested = o => { for (let p = o.parent; p && p !== group; p = p.parent) if (p.userData.dynamic) return true; return false; };
    group.traverse(o => {
      if (!o.isMesh || !o.userData.kit || o === group || nested(o) || o.userData.keep) return;
      const k = o.userData.kit;
      m.multiplyMatrices(inv, o.matrixWorld);
      if (k.basic) basicAcc.add(o.geometry, m, k.color); else if (k.glow) glowAcc.add(o.geometry, m, k.color); else toonAcc.add(o.geometry, m, k.color);
      if (k.outline) { const h = hullData(o.geometry, m); for (const x of h.pos) hullPos.push(x); for (const x of h.on) hullOn.push(x); }
      remove.push(o);
    });
    for (const o of remove) { o.parent.remove(o); for (const c of [...o.children]) if (c.userData.hull) o.remove(c); }
    const add = (geo, mat, castShadow) => { if (!geo) return; const mesh = new T.Mesh(geo, mat); mesh.castShadow = castShadow && cast; mesh.receiveShadow = true; group.add(mesh); };
    add(toonAcc.geometry(), sharedToonV, true);
    add(glowAcc.geometry(), sharedGlowV, false);
    add(basicAcc.geometry(), sharedBasicV, false);
    if (hullPos.length) {
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(hullPos, 3));
      g.setAttribute('onormal', new T.Float32BufferAttribute(hullOn, 3));
      g.computeBoundingSphere();
      group.add(new T.Mesh(g, outlineMaterial));
    }
    group.userData.baked = true;
    return group;
  }
  const sharedToonV = new T.MeshToonMaterial({ vertexColors: true, gradientMap: gradient });
  const sharedGlowV = new T.MeshBasicMaterial({ vertexColors: true }); sharedGlowV.color.setScalar(4.3);
  const sharedBasicV = new T.MeshBasicMaterial({ vertexColors: true });

  function bake(target) {
    root.updateMatrixWorld(true);
    const toonAcc = new Acc(), glowAcc = new Acc(), basicAcc = new Acc(), backAcc = new Acc(), winAcc = new Acc();
    const hullPos = [], hullOn = [], remove = [], dynamicOutlined = [];
    let phaseSeed = 1;
    root.traverse(o => {
      if (!o.isMesh || !o.userData.kit) return;
      const k = o.userData.kit;
      if (isDynamic(o)) { if (k.outline && !o.children.some(c => c.userData.hull)) dynamicOutlined.push(o); return; }
      if (k.window) winAcc.add(o.geometry, o.matrixWorld, k.color, (phaseSeed = (phaseSeed * 16807) % 2147483647) / 2147483647);
      else if (k.basic) basicAcc.add(o.geometry, o.matrixWorld, k.color);
      else if (k.glow) glowAcc.add(o.geometry, o.matrixWorld, k.color);
      else if (k.backdrop) backAcc.add(o.geometry, o.matrixWorld, k.color);
      else toonAcc.add(o.geometry, o.matrixWorld, k.color);
      if (k.outline) { const h = hullData(o.geometry, o.matrixWorld); for (const x of h.pos) hullPos.push(x); for (const x of h.on) hullOn.push(x); }
      remove.push(o);
    });
    for (const o of remove) o.parent.remove(o);
    for (const o of dynamicOutlined) addHull(o);
    const out = new T.Group();
    out.name = 'baked-static';
    const add = (geo, mat, cast, receive, name) => {
      if (!geo) return null;
      const m = new T.Mesh(geo, mat);
      m.castShadow = cast; m.receiveShadow = receive; m.name = name; m.matrixAutoUpdate = false;
      out.add(m);
      return m;
    };
    add(toonAcc.geometry(), sharedToonV, true, true, 'baked-toon');
    add(glowAcc.geometry(), sharedGlowV, false, false, 'baked-glow');
    add(basicAcc.geometry(), sharedBasicV, false, false, 'baked-unlit');
    add(backAcc.geometry(), new T.MeshToonMaterial({ vertexColors: true, gradientMap: gradient }), false, false, 'baked-backdrop');
    add(winAcc.geometry('phase'), windowMaterial(), false, false, 'baked-windows');
    if (hullPos.length) {
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(hullPos, 3));
      g.setAttribute('onormal', new T.Float32BufferAttribute(hullOn, 3));
      g.computeBoundingSphere();
      add(g, outlineMaterial, false, false, 'baked-ink');
    }
    target.add(out);
    target.add(root);
    return out;
  }

  return {
    T, root, gradient, toon, basic, mesh, box, sphere, cylinder, ring, lightBox, boxGeometry,
    addHull, hullGeometry, outlineMaterial, makeOutlineMaterial, outlineUniforms, windowUniforms, bake, bakeLocal
  };
}
