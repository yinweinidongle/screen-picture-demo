/* SPDX-License-Identifier: MIT */
import * as T from 'three';

const vertex = /* glsl */ `
attribute vec3 part;
attribute vec3 anchor;
uniform float stage, clock;
varying vec2 st, leafUV;
varying vec3 P,N,local,tag;
void main(){
  st=uv; leafUV=anchor.xy; tag=part; vec3 p=position;
#ifdef BERRY
  float growth=mix(.19,1.,smoothstep(0.,1.8,stage));
  p=anchor+(position-anchor)*growth;
#endif
  local=p;
  // A very light breath of air affects the canopy and leaves the roots anchored.
  p.x+=.017*sin(1.7*p.y+.72*clock)*smoothstep(.3,3.8,p.y);
  P=(modelMatrix*vec4(p,1.)).xyz;
  N=normalize(mat3(modelMatrix)*normal);
  gl_Position=projectionMatrix*viewMatrix*vec4(P,1.);
}
`;
const lighting = /* glsl */ `
precision highp float;
varying vec2 st, leafUV;
varying vec3 P,N,local,tag;
uniform float stage, clock, scan, picked, signalAt, plot, featured;
uniform sampler2D leafMap;
uniform float mapped, opticalReady;
uniform sampler2D opticalMap;
float line(float x){
  float width=clamp(fwidth(x),.007,.25);
  return 1.-smoothstep(width*.12,width*.92,abs(fract(x+.5)-.5));
}
float noise2(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.54);}
// Integrate a periodic line over a pixel. Fine meridians merge smoothly at the pole.
float thread(float turns,float thickness){
  float footprint=max(fwidth(turns),.0001);
  vec2 limits=turns+vec2(-.5,.5)*footprint+.5*thickness;
  vec2 coverage=floor(limits)*thickness+min(fract(limits),vec2(thickness));
  return clamp((coverage.y-coverage.x)/footprint,0.,1.);
}
void main(){
  vec3 V=isOrthographic?vec3(viewMatrix[0][2],viewMatrix[1][2],viewMatrix[2][2]):normalize(cameraPosition-P);
  vec3 n=normalize(N);
  if(dot(n,V)<0.)n=-n;
  vec3 L=normalize(vec3(-.58,.78,.76));
  float light=max(0.,dot(n,L)), rim=pow(1.-clamp(dot(n,V),0.,1.),2.8);
  float band=exp(-pow((fract((local.y+.5)/6.4-clock*.095+.5)-.5)*17.,2.));
  vec3 col; float surfaceAlpha=1.;
`;
const leaf = /* glsl */ `
  vec2 uv=st;
  vec3 sampleColor=texture2D(leafMap,uv).rgb;
  float texL=dot(sampleColor,vec3(.24,.64,.12));
  float ridge=exp(-pow((st.x-.5)*36.,2.));
  vec3 green=mix(vec3(.033,.12,.051),vec3(.14,.36,.145),light);
  col=mix(green,green*.48+sampleColor*(.40+.76*light),mapped);
  col+=vec3(.12,.16,.07)*ridge*.22+vec3(.15,.28,.13)*rim*.35;
  // The lower surface transmits the broad daylight through lamina between veins.
  vec3 backLight=normalize(vec3(-.56,.75,-.68));
  float transmission=max(0.,dot(-n,backLight))*(1.-.42*ridge);
  col+=sampleColor*vec3(.38,.29,.09)*transmission*(.44+.56*light);
  vec2 atlasUV=vec2((clamp(leafUV.x,.001,.999)+tag.x)*.5,leafUV.y);
  vec4 optical=texture2D(opticalMap,atlasUV,-.95);
  if(opticalReady>.5 && optical.a<.30)discard;
  // Subtract a coarser mip to recover the photographed veins at dashboard scale.
  // The broad illumination comes from the raking source and the curved lamina.
  vec3 broad=texture2D(opticalMap,atlasUV,1.42).rgb;
  vec3 vascular=max(vec3(0.),optical.rgb-broad);
  float grazing=pow(max(dot(n,normalize(L+V)),0.),12.);
  float heightLight=smoothstep(.70,3.65,local.y);
  float keyPool=1.-smoothstep(1.25,4.15,length((P.xy-vec2(-1.10,3.35))*vec2(1.,.70)));
  float depthFill=mix(.72,1.02,smoothstep(-1.25,.22,P.z));
  col*=mix(.61,1.,keyPool)*depthFill;
  col+=vec3(.028,.035,.019)*grazing;
  float canopy=(.54+.56*keyPool+.23*heightLight)*depthFill*(.92+.12*(1.-tag.y));
  vec3 paper=pow(max(optical.rgb,vec3(0.)),vec3(.78))*vec3(.86,1.045,1.08);
  vec3 jade=paper*(.49+.62*light+.22*transmission+.12*grazing)*canopy;
  jade+=vec3(.003,.041,.057)*keyPool*(.45+.55*light)*optical.a;
  jade+=vascular*vec3(1.38,1.90,1.93)*(.73+.41*keyPool);
  jade+=vec3(.072,.22,.25)*(grazing*.15+rim*.57)*optical.a*depthFill;
  jade+=vec3(.07,.14,.16)*band*max(0.,dot(optical.rgb,vec3(.18,.61,.21))-.15);
  jade=mix(vec3(.044,.102,.142)+vec3(.27,.55,.62)*(texL*1.12+ridge*.35+rim*.24),jade,opticalReady);
  float peak=max(jade.b,max(jade.r,jade.g));
  if(peak>.66)jade*=(.66+.24*(1.-exp(-2.70*(peak-.66))))/peak;
  col=mix(col,jade,scan);
`;
const fruit = /* glsl */ `
  if(tag.x>.5){
    col=mix(vec3(.039,.19,.082),vec3(.31,.48,.14),light)*(.8+.2*st.y);
    col+=vec3(.16,.31,.12)*(1.-smoothstep(.025,.22,abs(st.x-.5)))*.6;
    float keel=1.-smoothstep(.03,.28,abs(st.x-.5));
    float margin=smoothstep(.23,.5,abs(st.x-.5));
    vec3 calyx=vec3(.13,.30,.35)+vec3(.72,.73,.70)*(.48*light+.87*rim)
      +keel*vec3(.27,.40,.41)+vec3(.17,.36,.39)*(pow(st.y,2.)+.61*margin);
    col=mix(col,calyx,scan);
  } else {
    float age=clamp(tag.y+(stage-2.)*.57+sin(plot*2.+tag.z)*.042,0.,1.);
    vec3 skin=mix(vec3(.42,.59,.14),vec3(.94,.57,.105),smoothstep(.25,.58,age));
    skin=mix(skin,vec3(.99,.228,.088),smoothstep(.56,.80,age));
    skin=mix(skin,vec3(.87,.112,.07),smoothstep(.82,1.,age));
    float shoulder=(1.-smoothstep(.10,.47,st.y))*(.60-.3*age);
    skin=mix(skin,vec3(.46,.51,.10),shoulder*.65);
    float bloom=pow(max(0.,dot(n,normalize(L+V))),13.);
    float shine=pow(max(0.,dot(n,normalize(L+V))),74.);
    float lower=clamp(-n.y,0.,1.);
    float grain=noise2(floor(st*vec2(620.,400.)));
    col=skin*(.24+.67*light+.125*(n.y*.5+.5)+.036*grain);
    col+=vec3(.09,.014,.012)*lower+vec3(.37,.17,.115)*bloom+vec3(.57,.52,.42)*shine;
    vec3 refl=reflect(-V,n);
    float strip=exp(-pow((refl.y-.35+.10*refl.x)/.103,2.))*smoothstep(.06,.46,refl.x)*(1.-smoothstep(.64,.99,refl.x));
    col+=vec3(.37,.52,.39)*strip*.5;
    vec3 contour=mix(vec3(.85,.48,.18),vec3(.39,.95,.84),.68*scan);
    col+=contour*rim*(.57+.20*light);
    float warp=st.x*58.,weft=st.y*34.;
    float grid=max(thread(warp,.15),thread(weft,.13));
    float meridian=max(thread(warp/4.,.063),thread(weft/4.,.061));
    float highlight=1.-step(.4,abs(featured-tag.z));
    float north=pow(max(n.y*.5+.5,0.),4.2),left=clamp(.56-.50*n.x+.36*n.y,.12,1.);
    // A cool light between the middle trusses illuminates the wire from behind.
    vec2 distanceToLamp=(P.xy-vec2(-.18,2.38))*vec2(.83,.96);
    float caustic=exp(-dot(distanceToLamp,distanceToLamp));
    float wire=(.24+.17*north+.14*rim+.20*caustic)*grid+.25*meridian;
    float fresnel=pow(1.-clamp(dot(n,V),0.,1.),1.72);
    vec3 lamp=normalize(vec3(-.18,2.38,-.40)-P);
    float scattering=caustic*(.23+.72*max(0.,dot(-lamp,n)));
    vec3 cold=vec3(.013,.039,.091)+vec3(.008,.040,.073)*light+vec3(.065,.33,.35)*scattering;
    cold+=vec3(.33,.60,.70)*wire+vec3(.38,.84,.92)*fresnel*(.42+.65*left)
      +vec3(.20,.51,.59)*north*(.52+.33*left);
    cold+=vec3(.47,.71,.75)*fresnel*fresnel*(.43+.55*left+.33*caustic);
    cold+=vec3(.045,.25,.29)*band*(rim+.16);
    float redAge=smoothstep(.42,.86,age);
    vec3 redPigment=mix(vec3(.17,.30,.12),vec3(.43,.066,.109),redAge);
    vec3 red=redPigment*(.17+.45*light+.13*north)+vec3(.44,.53,.62)*wire;
    red+=vec3(.50,.75,.91)*(north*.43+fresnel*(.20+.67*left));
    red+=mix(vec3(.28,.62,.18),vec3(.94,.20,.15),redAge)*pow(max(n.x*.5+.5,0.),3.5)*(.35+.72*rim);
    col=mix(col,mix(cold,red,highlight),scan);
    float selected=(1.-step(.1,abs(tag.z-picked)))*exp(-max(0.,clock-signalAt)*1.7);
    col+=selected*vec3(.53,.78,.40)*(rim+.12*grid);
  }
`;
const stem = /* glsl */ `
  vec3 fiber=tag.x>.5?vec3(.49,.39,.18):vec3(.27,.48,.21);
  col=fiber*(.36+.70*light)+vec3(.25,.37,.16)*rim*.63;
  vec3 mint=tag.x>.5?vec3(.055,.12,.15):vec3(.16,.42,.49);
  float twist=st.x*11.+.68*sin(local.y*4.+st.x*6.);
  float striae=max(thread(twist,.15)*.31,thread(local.y*6.4+.16*sin(st.x*6.28),.088)*.25);
  float fiberLight=.48+.45*sin(local.y*1.7+.4);
  vec3 hollow=mint*(.27+.57*light)+vec3(.45,.89,.96)*(rim*(1.02+.28*light)+.16*band+striae+.23*fiberLight*line(twist*.46));
  float fork=exp(-15.*pow(local.y-1.16,2.)-10.*local.x*local.x)+exp(-17.*pow(local.y-2.68,2.)-13.*pow(local.x-.63,2.));
  float main=1.-smoothstep(.1,.53,abs(local.x-max(0.,local.y-1.1)*.41));
  hollow+=vec3(.23,.57,.72)*(fork*(.20+.32*light)+main*(.064+.20*striae));
  vec2 shaft=(P.xy-vec2(.18,2.25))*vec2(1.55,.83);
  hollow+=vec3(.19,.42,.48)*exp(-dot(shaft,shaft))*(.27+.44*light+.19*rim);
  hollow*=mix(.25,1.,smoothstep(-.12,.84,local.y));
  surfaceAlpha=mix(1.,smoothstep(-.15,.50,local.y),scan);
  if(tag.x>.5 && scan>.98)discard;
  col=mix(col,hollow,scan);
`;
const flower = /* glsl */ `
  col=mix(vec3(.91,.63,.105),vec3(1.,.87,.38),light);
  if(tag.x>2.5)col=vec3(.94,.50,.085);
  col+=vec3(.16,.15,.08)*rim; col=mix(col,vec3(.18,.38,.44)+rim*.25,scan);
`;

export function materials(uniforms) {
  const result = {};
  for (const [key, body] of Object.entries({ stem, leaf, fruit, flower })) {
    result[key] = new T.ShaderMaterial({
      uniforms,
      defines: key === 'fruit' ? { BERRY: 1 } : {},
      vertexShader: vertex,
      fragmentShader: lighting + body + 'gl_FragColor=vec4(col,surfaceAlpha);}',
      transparent: key === 'stem',
      side: T.DoubleSide,
    });
  }
  return result;
}

export function platform(uniforms) {
  const mat = new T.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    vertexShader: `varying vec2 st; void main(){st=uv*2.-1.;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 st; uniform float clock; uniform float scan;
    float ring(float r,float radius,float width){return 1.-smoothstep(width,width+fwidth(r),abs(r-radius));}
    void main(){
      float r=length(st), a=atan(st.y,st.x),t=a/6.2831853+.5;
      float atmosphere=exp(-r*r*4.7);
      float main=ring(r,.78,.002)+ring(r,.826,.0022)*.54+ring(r,.57,.0016)*.31;
      float segment=ring(r,.822,.006)*step(.21,fract(t*3.+.07))*step(fract(t*3.+.07),.32);
      float ticks=step(.81,fract(t*94.))*smoothstep(.71,.74,r)*(1.-smoothstep(.745,.76,r));
      float arc=ring(r,.78,.005)*pow(max(0.,cos(a-clock*.30)),19.);
      float alpha=atmosphere*.34+main*.40+ticks*.29+segment*.56+arc*.39;
      vec3 col=mix(vec3(.035,.14,.12),vec3(.28,.71,.53),min(1.,main+ticks+segment));
      col=mix(col,vec3(.54,.86,.65),arc);gl_FragColor=vec4(col,clamp(alpha,0.,.9)*mix(1.,.23,scan));
    }`,
  });
  const mesh = new T.Mesh(new T.PlaneGeometry(4.9, 4.9), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -0.43;
  return mesh;
}

// Fit the photographed lamina row by row so the printed midrib and veins follow
// the tapered procedural leaflet through the full length of the UV domain.
export function normalizedLeaf(image) {
  const source = document.createElement('canvas'),
    atlas = document.createElement('canvas'),
    size = 384;
  source.width = source.height = atlas.width = atlas.height = size;
  const ctx = source.getContext('2d', { willReadFrequently: true }),
    out = atlas.getContext('2d');
  ctx.drawImage(image, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size),
    bounds = [];
  for (let y = 0; y < size; y++) {
    let left = size,
      right = -1;
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      if (
        data[i + 3] > 100 &&
        Math.max(data[i], data[i + 1], data[i + 2]) > 39 &&
        data[i + 1] > data[i + 2] * 1.04
      ) {
        left = Math.min(left, x);
        right = x;
      }
    }
    bounds.push([left, right]);
  }
  const top = bounds.findIndex(([l, r]) => r - l > 5),
    bottom = bounds.findLastIndex(([l, r]) => r - l > 5);
  if (top < 0 || bottom <= top) return new T.Texture(image);
  for (let y = 0; y < size; y++) {
    const sy = Math.round(T.MathUtils.lerp(top, bottom, y / (size - 1))),
      [l, r] = bounds[sy];
    if (r > l) out.drawImage(source, l, sy, r - l + 1, 1, 0, y, size, 1);
  }
  return new T.CanvasTexture(atlas);
}

// Sample the two alpha silhouettes in their supplied atlas UV space. Each row
// spans the outermost opaque texels; the fragment mask preserves inner clefts.
export function opticalProfiles(image) {
  const canvas = document.createElement('canvas'),
    n = 384;
  canvas.width = n * 2;
  canvas.height = n;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, n * 2, n);
  const pixels = ctx.getImageData(0, 0, n * 2, n).data;
  return [0, 1].map((tile) => {
    const bounds = [];
    for (let y = 0; y < n; y++) {
      let left = n,
        right = -1;
      for (let x = 0; x < n; x++) {
        const k = 4 * (y * n * 2 + tile * n + x);
        if (pixels[k + 3] > 25) {
          left = Math.min(x, left);
          right = x;
        }
      }
      bounds.push([left, right]);
    }
    const top = bounds.findIndex(([a, b]) => b - a > 2),
      bottom = bounds.findLastIndex(([a, b]) => b - a > 2);
    if (top < 0 || bottom <= top) return null;
    const rows = [];
    for (let y = bottom; y >= top; y--) {
      const [l, r] = bounds[y];
      let center = 0,
        count = 0;
      for (let k = Math.max(top, y - 16); k <= Math.min(bottom, y + 16); k++) {
        const [a, b] = bounds[k];
        if (a <= b) {
          center += (a + b + 1) * 0.5;
          count++;
        }
      }
      const mid = count ? T.MathUtils.clamp(center / count, l, r + 1) : n * 0.5;
      rows.push([Math.max(0, l - 1) / n, mid / n, Math.min(n, r + 2) / n, 1 - (y + 0.5) / n]);
    }
    return rows;
  });
}
