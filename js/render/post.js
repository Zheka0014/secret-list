// HDR pipeline: scene → MSAA half-float target → two-level bloom → soft-knee
// tone curve, gentle grade and vignette → (optional FXAA) → screen.
const VERT = 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';

export function createPost(T, renderer) {
  const isGL2 = renderer.capabilities.isWebGL2;
  const make = (depth, samples = 0) => {
    const rt = new T.WebGLRenderTarget(1, 1, { type: T.HalfFloatType, depthBuffer: depth, minFilter: T.LinearFilter, magFilter: T.LinearFilter });
    rt.samples = samples;
    return rt;
  };
  const scene = make(true, 0), b1a = make(false), b1b = make(false), b2a = make(false), b2b = make(false);
  const ldr = new T.WebGLRenderTarget(1, 1, { depthBuffer: false });
  ldr.texture.colorSpace = T.SRGBColorSpace;
  const quadScene = new T.Scene(), cam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1), quad = new T.Mesh(new T.PlaneGeometry(2, 2));
  quad.frustumCulled = false; quadScene.add(quad);

  const extract = new T.ShaderMaterial({
    depthTest: false, depthWrite: false, uniforms: { source: { value: null }, threshold: { value: 1.6 }, texel: { value: new T.Vector2() } }, vertexShader: VERT,
    fragmentShader: `varying vec2 vUv;uniform sampler2D source;uniform float threshold;uniform vec2 texel;
void main(){vec3 c=(texture2D(source,vUv+texel*vec2(-.5,-.5)).rgb+texture2D(source,vUv+texel*vec2(.5,-.5)).rgb+texture2D(source,vUv+texel*vec2(-.5,.5)).rgb+texture2D(source,vUv+texel*vec2(.5,.5)).rgb)*.25;
float peak=max(c.r,max(c.g,c.b));float soft=clamp(peak-threshold+.5,0.,1.);soft=soft*soft*.5;float w=max(soft,peak-threshold)/max(peak,1e-4);
gl_FragColor=vec4(min(c*w,vec3(24.)),1.);}`
  });
  const blur = new T.ShaderMaterial({
    depthTest: false, depthWrite: false, uniforms: { source: { value: null }, direction: { value: new T.Vector2() } }, vertexShader: VERT,
    fragmentShader: `varying vec2 vUv;uniform sampler2D source;uniform vec2 direction;
void main(){vec3 c=texture2D(source,vUv).rgb*.227027;c+=texture2D(source,vUv+direction*1.384615).rgb*.316216;c+=texture2D(source,vUv-direction*1.384615).rgb*.316216;c+=texture2D(source,vUv+direction*3.230769).rgb*.070270;c+=texture2D(source,vUv-direction*3.230769).rgb*.070270;gl_FragColor=vec4(c,1.);}`
  });
  const composite = new T.ShaderMaterial({
    depthTest: false, depthWrite: false,
    uniforms: { source: { value: scene.texture }, bloom1: { value: b1a.texture }, bloom2: { value: b2a.texture }, bloomStrength: { value: .32 }, useBloom: { value: 1 }, exposure: { value: 1 }, saturation: { value: 1.07 }, vignette: { value: .1 }, flash: { value: new T.Vector4(1, 1, 1, 0) } },
    vertexShader: VERT,
    fragmentShader: `varying vec2 vUv;uniform sampler2D source;uniform sampler2D bloom1;uniform sampler2D bloom2;uniform float bloomStrength;uniform float useBloom;uniform float exposure;uniform float saturation;uniform float vignette;uniform vec4 flash;
vec3 softKnee(vec3 c){vec3 k=vec3(.78);vec3 over=max(c-k,0.);return min(c,k)+(1.-k)*(1.-exp(-over/(1.-k)));}
void main(){vec3 c=texture2D(source,vUv).rgb*exposure;
if(useBloom>.5)c+=(texture2D(bloom1,vUv).rgb*.6+texture2D(bloom2,vUv).rgb*.9)*bloomStrength;
c=softKnee(max(c,0.));
float l=dot(c,vec3(.2126,.7152,.0722));c=mix(vec3(l),c,saturation);
float v=smoothstep(.85,.2,length((vUv-.5)*vec2(.95,1.1)));c*=1.-vignette+vignette*v;
c=mix(c,flash.rgb,flash.a);
gl_FragColor=vec4(clamp(c,0.,1.),1.);
#include <colorspace_fragment>
}`
  });
  const fxaa = new T.ShaderMaterial({
    depthTest: false, depthWrite: false, uniforms: { source: { value: ldr.texture }, texel: { value: new T.Vector2() } }, vertexShader: VERT,
    fragmentShader: `varying vec2 vUv;uniform sampler2D source;uniform vec2 texel;
void main(){vec3 rgbNW=texture2D(source,vUv+vec2(-1.,-1.)*texel).rgb;vec3 rgbNE=texture2D(source,vUv+vec2(1.,-1.)*texel).rgb;vec3 rgbSW=texture2D(source,vUv+vec2(-1.,1.)*texel).rgb;vec3 rgbSE=texture2D(source,vUv+vec2(1.,1.)*texel).rgb;vec4 rgbaM=texture2D(source,vUv);vec3 rgbM=rgbaM.rgb;
vec3 luma=vec3(.299,.587,.114);float lNW=dot(rgbNW,luma),lNE=dot(rgbNE,luma),lSW=dot(rgbSW,luma),lSE=dot(rgbSE,luma),lM=dot(rgbM,luma);
float lMin=min(lM,min(min(lNW,lNE),min(lSW,lSE))),lMax=max(lM,max(max(lNW,lNE),max(lSW,lSE)));
vec2 dir=vec2(-((lNW+lNE)-(lSW+lSE)),((lNW+lSW)-(lNE+lSE)));float dirReduce=max((lNW+lNE+lSW+lSE)*(.25*.125),1./128.);float rcp=1./(min(abs(dir.x),abs(dir.y))+dirReduce);dir=clamp(dir*rcp,-8.,8.)*texel;
vec3 a=.5*(texture2D(source,vUv+dir*(1./3.-.5)).rgb+texture2D(source,vUv+dir*(2./3.-.5)).rgb);vec3 b=a*.5+.25*(texture2D(source,vUv+dir*-.5).rgb+texture2D(source,vUv+dir*.5).rgb);float lB=dot(b,luma);
gl_FragColor=vec4((lB<lMin||lB>lMax)?a:b,1.);
#include <colorspace_fragment>
}`
  });
  const copy = new T.ShaderMaterial({ depthTest: false, depthWrite: false, uniforms: { source: { value: null } }, vertexShader: VERT, fragmentShader: 'varying vec2 vUv;uniform sampler2D source;void main(){gl_FragColor=texture2D(source,vUv);}' });

  let width = 0, height = 0, samples = -1, bloomOn = true, fxaaOn = false;
  const size = new T.Vector2();
  function pass(material, target) { quad.material = material; renderer.setRenderTarget(target); renderer.render(quadScene, cam); }

  return {
    composite,
    configure({ msaa = 4, bloom = true, fxaa: useFxaa = false }) {
      const s = isGL2 ? Math.min(msaa, renderer.capabilities.maxSamples) : 0;
      if (s !== samples) { samples = s; scene.samples = s; scene.dispose(); }
      bloomOn = bloom; fxaaOn = useFxaa;
      composite.uniforms.useBloom.value = bloom ? 1 : 0;
    },
    setFlash(color, amount) { composite.uniforms.flash.value.set(color.r, color.g, color.b, amount); },
    render(world, view) {
      renderer.getDrawingBufferSize(size);
      if (size.x !== width || size.y !== height) {
        width = size.x; height = size.y;
        scene.setSize(width, height); ldr.setSize(width, height);
        const w1 = Math.max(1, width >> 2), h1 = Math.max(1, height >> 2), w2 = Math.max(1, width >> 3), h2 = Math.max(1, height >> 3);
        b1a.setSize(w1, h1); b1b.setSize(w1, h1); b2a.setSize(w2, h2); b2b.setSize(w2, h2);
        extract.uniforms.texel.value.set(1 / width, 1 / height);
        fxaa.uniforms.texel.value.set(1 / width, 1 / height);
      }
      renderer.setRenderTarget(scene);
      renderer.render(world, view);
      if (bloomOn) {
        extract.uniforms.source.value = scene.texture; pass(extract, b1a);
        const w1 = b1a.width, h1 = b1a.height;
        blur.uniforms.source.value = b1a.texture; blur.uniforms.direction.value.set(1.2 / w1, 0); pass(blur, b1b);
        blur.uniforms.source.value = b1b.texture; blur.uniforms.direction.value.set(0, 1.2 / h1); pass(blur, b1a);
        copy.uniforms.source.value = b1a.texture; pass(copy, b2a);
        const w2 = b2a.width, h2 = b2a.height;
        blur.uniforms.source.value = b2a.texture; blur.uniforms.direction.value.set(1.6 / w2, 0); pass(blur, b2b);
        blur.uniforms.source.value = b2b.texture; blur.uniforms.direction.value.set(0, 1.6 / h2); pass(blur, b2a);
      }
      if (fxaaOn) { pass(composite, ldr); pass(fxaa, null); }
      else pass(composite, null);
    },
    dispose() { for (const rt of [scene, b1a, b1b, b2a, b2b, ldr]) rt.dispose(); }
  };
}
