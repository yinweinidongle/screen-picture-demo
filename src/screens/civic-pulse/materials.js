/* SPDX-License-Identifier: MIT */
import * as T from 'three';
import { woodGeometry } from './canopy.js';

const signal = `
uniform float clock, focus, launch;
uniform vec4 load;
float selected(float group){return focus<-.5||group<-.5||abs(focus-group)<.4?1.:0.;}
float activity(float g){return g<-.5?.65:g<.5?load.x:g<1.5?load.y:g<2.5?load.z:load.w;}
float front(float arc,float group){
  float cycle=mod(arc-clock*1.42+9.,9.)-4.5;
  float event=arc-(clock-launch)*2.45;
  return (.27+.54*activity(group))*exp(-cycle*cycle/.40)+1.22*exp(-event*event/.24)*selected(group);
}
vec3 hue(float g){
  if(g<-.5)return vec3(.045,.39,.65);
  if(g<.5)return vec3(.035,.60,.66);
  if(g<1.5)return vec3(.075,.36,.82);
  if(g<2.5)return vec3(.24,.46,.70);
  return vec3(.06,.60,.42);
}`;

export function sceneObjects(model, uniforms) {
  const wood = woodGeometry(model.branches);
  const common = `attribute vec2 trace,meta;attribute float girth;
  varying vec2 path, info;varying vec3 surface;`;
  const vertex = `${common}
    void main(){path=trace;info=meta;surface=normalize(normalMatrix*normal);
      gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}
  `;
  const body = new T.Mesh(
    wood,
    new T.ShaderMaterial({
      uniforms,
      vertexShader: vertex,
      fragmentShader: `
    varying vec2 path,info; varying vec3 surface; ${signal}
    void main(){
      vec3 n=normalize(surface);float arc=path.y,a=path.x*6.283185,seed=info.y;
      float twist=a+.28*sin(arc*1.47+seed)+.17*sin(arc*2.8-2.*a)+.26*sin(2.*a+arc*.7);
      float grain=.5+.5*cos(10.*twist+2.8*sin(2.*twist+arc*.96));
      float hair=pow(.5+.5*cos(31.*twist+2.65*sin(3.*twist-arc)),11.);
      float silk=pow(grain,4.6)+.27*hair;
      float light=.5+.5*dot(n,normalize(vec3(-.68,.76,.46)));
      float rim=pow(1.-clamp(n.z,0.,1.),1.85), pulse=front(arc,info.x);
      float gloss=pow(max(dot(n,normalize(vec3(-.58,.37,.72))),0.),3.8);
      vec3 base=mix(vec3(.002,.014,.08),hue(info.x),.13);
      vec3 color=base*(.25+.76*light)+vec3(.006,.075,.31)*gloss;
      color+=mix(vec3(.019,.25,.78),hue(info.x)*1.3,.38)*silk*(.48+.88*gloss);
      color+=vec3(.08,.60,1.05)*(rim*.80+.13*silk);
      color+=vec3(.29,.95,1.)*pulse*(.10+silk*1.28);
      color*=mix(.24,1.,selected(info.x));
      gl_FragColor=vec4(color,1.);
      #include <colorspace_fragment>
    }`,
    }),
  );
  const halo = new T.Mesh(
    wood,
    new T.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      side: T.BackSide,
      blending: T.AdditiveBlending,
      vertexShader: `${common}
      void main(){path=trace;info=meta;surface=normalMatrix*normal;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position+normal*(.028+girth*.46),1.);}`,
      fragmentShader: `varying vec2 path,info;varying vec3 surface;${signal}
      void main(){float edge=pow(clamp(abs(normalize(surface).z),0.,1.),1.75);
        float a=edge*(.14+.22*front(path.y,info.x))*mix(.20,1.,selected(info.x));
        gl_FragColor=vec4(.025,.57,1.,a);}`,
    }),
  );
  const xyz = [],
    tags = [],
    sizes = [];
  for (const [x, y, z, g, d, size, seed, tip] of model.stars) {
    xyz.push(x, y, z);
    tags.push(g, d, seed, tip);
    sizes.push(size);
  }
  const cloud = new T.BufferGeometry();
  for (const [key, list, n] of [
    ['position', xyz, 3],
    ['pointMeta', tags, 4],
    ['diameter', sizes, 1],
  ])
    cloud.setAttribute(key, new T.Float32BufferAttribute(list, n));
  const motes = new T.Points(
    cloud,
    new T.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: T.AdditiveBlending,
      vertexShader: `attribute vec4 pointMeta;attribute float diameter;uniform float resolutionScale;varying vec4 vStar;${signal}
      void main(){
        float flash=front(pointMeta.y,pointMeta.x),sel=selected(pointMeta.x);
        float twinkle=.72+.28*sin(clock*(.7+pointMeta.z)+pointMeta.z*70.);
        vStar=vec4(pointMeta.x,pointMeta.z,pointMeta.w,twinkle*(.58+.62*flash)*mix(.18,1.,sel));
        vec3 p=position; p.y+=sin(clock*.42+p.x*1.6+pointMeta.z*17.)*.014*(1.-pointMeta.w);
        gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
        gl_PointSize=clamp(diameter*resolutionScale*(1.6+pointMeta.w*(3.6+flash*2.3)),1.,34.);}`,
      fragmentShader: `varying vec4 vStar;${signal}
      void main(){
        vec2 p=gl_PointCoord*2.-1.;float r=dot(p,p);if(r>1.)discard;
        float core=exp(-r*6.5),tip=vStar.z;
        vec3 c=mix(hue(vStar.x)*1.5,vec3(.51,.97,1.),.28+core*.38);
        if(vStar.y>.89||(vStar.x>1.5&&vStar.x<2.5&&vStar.y>.58)) c=mix(vec3(.87,.49,.17),vec3(1.,.88,.61),core);
        float light=mix(exp(-r*2.7),core+.17*exp(-r*2.)+.11*exp(-abs(p.x*p.y)*130.-r*4.),tip);
        gl_FragColor=vec4(c,light*vStar.w);
        #include <colorspace_fragment>
      }`,
    }),
  );
  const floor = new T.Mesh(
    new T.PlaneGeometry(7.3, 7.3),
    new T.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: T.AdditiveBlending,
      vertexShader: `varying vec2 local;void main(){local=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `varying vec2 local;uniform float clock;
      void main(){float rad=length(local),angle=atan(local.y,local.x);
        float aa=max(.012,fwidth(rad));float r1=1.-smoothstep(.006,aa+.01,abs(rad-2.46));
        float r2=1.-smoothstep(.006,aa+.012,abs(rad-2.60));
        float r3=1.-smoothstep(.006,aa+.01,abs(rad-2.90));
        float ticks=smoothstep(.77,.97,cos(96.*angle))*smoothstep(2.64,2.68,rad)*(1.-smoothstep(2.78,2.81,rad));
        float phase=mod(clock*.32,2.45);float wave=.12*exp(-pow((rad-phase)/.075,2.))*(1.-rad/2.65);
        float a=.26*exp(-rad*rad/1.85)+r1*.33+r2*(.12+.36*smoothstep(-.5,.9,cos(3.*angle-.3)))+r3*.14+ticks*.34+max(0.,wave);
        gl_FragColor=vec4(.055,.72,.81,a); }`,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.036;
  floor.renderOrder = -1;
  // A second, broad optical halo follows the large limbs; it keeps its softness at forks.
  const lights = [],
    spec = [];
  for (const b of model.branches) {
    if (b.level > 1) continue;
    const steps = Math.ceil(b.length * 8);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps,
        p = b.curve.getPointAt(t);
      lights.push(p.x, p.y, p.z);
      spec.push(b.sector, b.start + t * b.length, 0.5 + 4.5 * b.radius * (1 - t) ** 0.7);
    }
  }
  const glowGeometry = new T.BufferGeometry();
  glowGeometry.setAttribute('position', new T.Float32BufferAttribute(lights, 3));
  glowGeometry.setAttribute('aGlow', new T.Float32BufferAttribute(spec, 3));
  const glow = new T.Points(
    glowGeometry,
    new T.ShaderMaterial({
      uniforms,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: T.AdditiveBlending,
      vertexShader: `attribute vec3 aGlow;uniform float worldScale;varying float strength;${signal}
      void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
        gl_PointSize=clamp(worldScale*aGlow.z,2.,196.);
        strength=(.023+.064*front(aGlow.y,aGlow.x))*mix(.13,1.,selected(aGlow.x));}`,
      fragmentShader: `varying float strength;void main(){vec2 p=gl_PointCoord*2.-1.;float r=dot(p,p);
      gl_FragColor=vec4(.012,.38,1.,exp(-r*5.)*(1.-smoothstep(.6,1.,r))*strength);}`,
    }),
  );
  return { body, halo, glow, motes, floor };
}
