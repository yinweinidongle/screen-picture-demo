import * as T from 'three';
import { MATERIAL_START, MATERIAL_END } from './sequence.js';

// World-space front shared by every carriage, floor panel, soffit and fixture.
// The turbulence/grid stay attached to a moving vehicle while the wave travels through the station.
const field = /* glsl */ `
uniform float uFilmTime;
uniform float uFront;
uniform float uConsistZ;
uniform float uTargetTrain;
uniform float uPhaseOn;
float wsHash(vec3 p) {
  p=fract(p*.3183099+vec3(.129,.317,.513)); p*=17.0;
  return fract(p.x*p.y*p.z*(p.x+p.y+p.z));
}
float wsNoise(vec3 p) {
  vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(mix(wsHash(i),wsHash(i+vec3(1,0,0)),f.x),mix(wsHash(i+vec3(0,1,0)),wsHash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(wsHash(i+vec3(0,0,1)),wsHash(i+vec3(1,0,1)),f.x),mix(wsHash(i+vec3(0,1,1)),wsHash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
vec3 wsAnchor(vec3 p){return p-vec3(0.,0.,uConsistZ*uTargetTrain);}
float wsDistance(vec3 world) {
  vec3 p=wsAnchor(world);
  vec3 off=vec3(0.,uFilmTime*.24,-uFilmTime*.17);
  float distort=(wsNoise(p*1.37+off)-.5)*1.52+(wsNoise(p*3.75-off)-.5)*.61+(wsNoise(p*10.9+off)-.5)*.205;
  return uFront-(world.z+world.x*.16-world.y*.28+distort);
}
vec3 wsArc(float d,vec3 p){
  float ad=abs(d), aa=min(.068,fwidth(d))+.010;
  float white=1.-smoothstep(.020,.067+aa,ad);
  float corona=exp(-ad*6.4);
  float split=abs(d-.25-.24*wsNoise(wsAnchor(p)*3.5));
  float fork=(1.-smoothstep(.012,.038+aa,split))*smoothstep(.42,.70,wsNoise(wsAnchor(p)*1.7));
  return vec3(3.40,6.20,7.65)*white + vec3(.014,.88,2.50)*corona + vec3(.025,.91,1.75)*exp(-ad*16.) + vec3(.16,1.52,2.64)*fork;
}`;
export const fx = {
  uFilmTime: { value: 0 },
  uFront: { value: 101 },
  uConsistZ: { value: -48 },
  uPhaseOn: { value: 0 },
  uInspect: { value: 0 },
  uWetMap: { value: null },
  uWetMatrix: { value: new T.Matrix4() },
};
// Normalized scan time and world Z in metres. A single, strictly receding
// plane meets the moving cab, follows the window tracking shot, then clears the tail.
const checkpoints = [
  [0, 98],
  [0.02, 34],
  [0.045, 14.2],
  [0.075, 13.3],
  [0.14, 12.4],
  [0.25, 11.1],
  [0.295, 10.6],
  [0.365, 8.4],
  [0.47, 3.3],
  [0.585, -4.8],
  [0.735, -14],
  [0.82, -35],
  [0.895, -67],
  [0.955, -115],
  [1, -185],
];
function frontPosition(progress) {
  if (progress <= 0) return checkpoints[0][1];
  if (progress >= 1) return checkpoints.at(-1)[1];
  let i = 0;
  while (i + 1 < checkpoints.length - 1 && progress > checkpoints[i + 1][0]) i++;
  const a = checkpoints[i],
    b = checkpoints[i + 1],
    u = (progress - a[0]) / (b[0] - a[0]);
  const slope = (j) => {
    if (j === 0)
      return (checkpoints[1][1] - checkpoints[0][1]) / (checkpoints[1][0] - checkpoints[0][0]);
    if (j === checkpoints.length - 1)
      return (
        (checkpoints[j][1] - checkpoints[j - 1][1]) / (checkpoints[j][0] - checkpoints[j - 1][0])
      );
    const left =
      (checkpoints[j][1] - checkpoints[j - 1][1]) / (checkpoints[j][0] - checkpoints[j - 1][0]);
    const right =
      (checkpoints[j + 1][1] - checkpoints[j][1]) / (checkpoints[j + 1][0] - checkpoints[j][0]);
    return (2 * left * right) / (left + right);
  };
  const h = b[0] - a[0];
  return (
    (2 * u * u * u - 3 * u * u + 1) * a[1] +
    (u * u * u - 2 * u * u + u) * h * slope(i) +
    (-2 * u * u * u + 3 * u * u) * b[1] +
    (u * u * u - u * u) * h * slope(i + 1)
  );
}
export function setPhase(time, trainZ) {
  const progress = (time - MATERIAL_START) / (MATERIAL_END - MATERIAL_START);
  fx.uFilmTime.value = time;
  fx.uConsistZ.value = trainZ;
  fx.uFront.value = frontPosition(progress);
  fx.uPhaseOn.value = time >= MATERIAL_START ? 1 : 0;
}
function uniforms(train) {
  return { ...fx, uTargetTrain: { value: train ? 1 : 0 } };
}

const wetCode = /* glsl */ `
  vec4 wetClip = uWetMatrix * vec4(vWsWorld,1.);
  vec2 wetUv = wetClip.xy / max(.001,wetClip.w);
  vec2 distortion=vec2(wsNoise(vWsWorld*vec3(2.1,.1,.63)),wsNoise(vWsWorld*vec3(.92,.2,1.78)+3.7))-.5;
  float pool=wsNoise(vWsWorld*.66)*.66+wsNoise(vWsWorld*2.5)*.34;
  vec2 ripple=distortion*(.0016+.005*pool);
  vec2 sampleUV=clamp(wetUv+ripple,vec2(.005),vec2(.995));
  vec3 reflected=texture2D(uWetMap,sampleUV).rgb*.46;
  reflected+=texture2D(uWetMap,clamp(sampleUV+distortion*.007,vec2(.005),vec2(.995))).rgb*.31;
  reflected+=texture2D(uWetMap,clamp(sampleUV-distortion*.009,vec2(.005),vec2(.995))).rgb*.23;
  float grazing=pow(1.-clamp(abs(dot(normalize(vViewPosition),normal)),0.,1.),2.);
  float puddle=mix(.13,.74,smoothstep(.35,.66,pool));
  outgoingLight=mix(outgoingLight,reflected,puddle*(.22+.67*grazing));
`;
export function patchSurface(material, target, { wet = false, stone = false } = {}) {
  if (!target && !wet && !stone) return;
  const u = uniforms(target === 'train');
  material.customProgramCacheKey = () => `wangshu-pbr-4/${target || 'static'}/${wet}/${stone}`;
  material.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u);
    s.vertexShader = 'varying vec3 vWsWorld;\n' + s.vertexShader;
    s.vertexShader = s.vertexShader.replace(
      '#include <project_vertex>',
      '#include <project_vertex>\n vWsWorld=(modelMatrix*vec4(transformed,1.)).xyz;',
    );
    s.fragmentShader =
      'varying vec3 vWsWorld;\n' +
      field +
      (wet ? '\nuniform sampler2D uWetMap;uniform mat4 uWetMatrix;\n' : '\n') +
      s.fragmentShader;
    if (target)
      s.fragmentShader = s.fragmentShader.replace(
        '#include <alphatest_fragment>',
        `#include <alphatest_fragment>
      float wsd = uPhaseOn>.5 ? wsDistance(vWsWorld) : 999.;
      if(wsd<0.)discard;`,
      );
    if (stone)
      s.fragmentShader = s.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
      float stoneVariation = .64+.54*wsNoise(vWsWorld*1.3)+.13*wsNoise(vWsWorld*18.);
      diffuseColor.rgb*=stoneVariation;`,
      );
    s.fragmentShader = s.fragmentShader.replace(
      '#include <opaque_fragment>',
      (wet ? wetCode : '') +
        (target ? '\n if(uPhaseOn>.5)outgoingLight+=wsArc(wsd,vWsWorld);\n' : '') +
        '#include <opaque_fragment>',
    );
  };
  material.needsUpdate = true;
}
const vertex = /* glsl */ `
varying vec3 vWorld;varying vec3 vView;varying vec3 vEyeNormal;varying vec3 vWorldNormal;varying vec2 vPanelUV;
uniform mat3 uPanelMatrix;
void main(){
 vPanelUV=(uPanelMatrix*vec3(uv,1.)).xy;
 vec4 world=modelMatrix*vec4(position,1.);
 vec4 eye=viewMatrix*world;
 vWorld=world.xyz;vView=-eye.xyz;vEyeNormal=normalMatrix*normal;
 vWorldNormal=(vec4(vEyeNormal,0.)*viewMatrix).xyz;
 gl_Position=projectionMatrix*eye;
}`;
const fragment =
  /* glsl */ `
varying vec3 vWorld;varying vec3 vView;varying vec3 vEyeNormal;varying vec3 vWorldNormal;varying vec2 vPanelUV;
uniform float uTrim;uniform float uPane;uniform float uDeck;uniform float uInspect;
` +
  field +
  /* glsl */ `
float band(float cycles,float halfWidth){
 float footprint=max(fwidth(cycles),.0001);
 float d=abs(fract(cycles+.5)-.5);
 float mark=1.-smoothstep(halfWidth-footprint*.52,halfWidth+footprint*.52,d);
 return mix(mark,clamp(2.*halfWidth,0.,1.),smoothstep(.30,.82,footprint));
}
float lattice(vec3 p,vec3 n,float spacing,float width){
 vec3 w=pow(abs(normalize(n)),vec3(6.));w/=max(.0001,w.x+w.y+w.z);
 vec3 a=p/spacing;vec3 l=vec3(band(a.x,width),band(a.y,width),band(a.z,width));
 return dot(w,vec3(max(l.y,l.z),max(l.x,l.z),max(l.x,l.y)));
}
void main(){
 float d=wsDistance(vWorld);if(uPhaseOn<.5||d>=0.)discard;
 vec3 p=wsAnchor(vWorld);
 vec3 N=normalize(vEyeNormal),V=normalize(vView);
 float f=pow(1.-abs(dot(N,V)),2.15);
 float rim=f*(1.-.28*smoothstep(.78,1.,f));
 float spacing=mix(.90,.47,uTargetTrain);
 float grid=lattice(p,vWorldNormal,spacing,.020);
 float structural=lattice(p,vWorldNormal,spacing*4.,.011);
 float scan=band(p.y*13.-uFilmTime*1.5,.13);
 float meshLine=clamp(grid*.83+structural*.71,0.,1.);
 float deckTop=uDeck*smoothstep(.65,.98,abs(normalize(vWorldNormal).y));
 rim*=1.-.64*deckTop;
 vec3 deep=mix(vec3(.006,.066,.14),vec3(.010,.100,.21),uTargetTrain);
 vec3 energy=deep + vec3(.018,.67,1.15)*meshLine + vec3(.055,.89,1.78)*rim + vec3(.005,.035,.065)*scan;
 energy+=uTrim*vec3(.08,.77,1.20);
 float a=clamp(.16+.31*meshLine+.48*rim+.24*uTrim-.045*deckTop,.095,.86);
 if(uPane>.5){
   vec2 edge=min(vPanelUV,1.-vPanelUV);
   float inner=min(edge.x,edge.y);
   float outline=uPane<1.5 ? 1.-smoothstep(.014,.035+min(.035,fwidth(inner)),inner) : 0.;
   energy=vec3(.004,.033,.092)+vec3(.012,.24,.46)*meshLine+vec3(.05,.54,1.2)*rim + vec3(.11,1.04,1.63)*outline;
   a=.46+.17*rim+.22*outline;
 }
 // Add HDR radiance to the resolved grid strokes, so the bloom pass picks up
 // their cores. Glazing carries a gentler line and keeps its darker interior.
 float wireCore=meshLine*meshLine*meshLine;
 energy+=vec3(.055,.78,1.28)*wireCore*mix(1.,.52,step(.5,uPane));
 vec3 arc=wsArc(d,vWorld);float arcCoverage=exp(-abs(d)*6.2);
 energy+=arc; a=mix(a,.95,arcCoverage);
 if(uInspect>.5 && uInspect<1.5){energy=vec3(meshLine);a=.82;}
 if(uInspect>1.5 && uInspect<2.5){energy=vec3(rim);a=.82;}
 if(uInspect>2.5){energy=vec3(smoothstep(-.4,0.,d),meshLine*.15,abs(d)<.09?1.:0.);a=.8;}
 gl_FragColor=vec4(energy,a);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;
export function projectionMaterial(train, trim, pane, deck, map) {
  if (map) map.updateMatrix();
  return new T.ShaderMaterial({
    name: train ? 'WS 700 • luminous lattice' : 'Platform • luminous lattice',
    uniforms: {
      ...uniforms(train),
      uTrim: { value: trim ? 1 : 0 },
      uPane: { value: pane },
      uDeck: { value: deck ? 1 : 0 },
      uPanelMatrix: { value: map ? map.matrix.clone() : new T.Matrix3() },
    },
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: T.FrontSide,
    blending: T.NormalBlending,
    toneMapped: true,
  });
}

export function projectionDepth(train) {
  const depth = new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking });
  const u = uniforms(train);
  depth.customProgramCacheKey = () => 'wangshu-depth-' + Number(train);
  depth.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u);
    s.vertexShader = 'varying vec3 vWsWorld;\n' + s.vertexShader;
    s.vertexShader = s.vertexShader.replace(
      '#include <project_vertex>',
      '#include <project_vertex>\n vWsWorld=(modelMatrix*vec4(transformed,1.)).xyz;',
    );
    s.fragmentShader = 'varying vec3 vWsWorld;\n' + field + '\n' + s.fragmentShader;
    s.fragmentShader = s.fragmentShader.replace(
      '#include <alphatest_fragment>',
      '#include <alphatest_fragment>\n if(uPhaseOn>.5 && wsDistance(vWsWorld)<0.)discard;',
    );
  };
  return depth;
}
