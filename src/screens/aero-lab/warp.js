/* SPDX-License-Identifier: MIT */
import * as T from 'three';

// A hollow volume of longitudinal streaks. The car occludes the ribbons, and
// the reflector sees them from its own camera, including the low ground streaks.
export function createWarpField() {
  const count = 292,
    origins = [],
    shapes = [];
  let seed = 0x128c02d;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < count; i++) {
    const angle = (i + 0.31) * 2.399963,
      radius = 3.35 + random() * 8.2;
    const low = i % 6 === 0;
    const x = low ? (i % 12 === 0 ? -1 : 1) * (1.2 + random() * 7.4) : Math.cos(angle) * radius;
    const y = low
      ? 0.035 + random() * 0.17
      : 0.18 + Math.abs(Math.sin(angle)) * (2.3 + radius * 0.76);
    origins.push(x, y, random() * 132);
    shapes.push(random(), random(), random(), random());
  }
  const g = new T.InstancedBufferGeometry();
  g.setIndex([0, 1, 2, 2, 1, 3]);
  g.setAttribute(
    'position',
    new T.Float32BufferAttribute([0, -1, 0, 0, 1, 0, 1, -1, 0, 1, 1, 0], 3),
  );
  g.setAttribute('origin', new T.InstancedBufferAttribute(new Float32Array(origins), 3));
  g.setAttribute('shape', new T.InstancedBufferAttribute(new Float32Array(shapes), 4));
  g.instanceCount = count;
  const uniforms = {
    travel: { value: 0 },
    boost: { value: 0 },
    entry: { value: 0 },
    spectrumPhase: { value: 0 },
  };
  const mat = new T.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    forceSinglePass: true,
    blending: T.AdditiveBlending,
    vertexShader: `attribute vec3 origin;attribute vec4 shape;uniform float travel,boost,entry;
      varying vec2 strip;varying float brightness;varying float pigment;
      void main(){
        float z=15.-mod(origin.z+travel*.72,132.);
        float len=mix(5.,47.,shape.x*shape.x)*mix(.12,1.,boost);
        float t=position.x;
        vec3 p=vec3(origin.xy,z+len*(t-.5));
        vec4 eye=modelViewMatrix*vec4(p,1.);
        vec3 tangent=mat3(modelViewMatrix)*vec3(0.,0.,1.);
        vec3 across=cross(tangent,-eye.xyz);
        float halfWidth=mix(.017,.082,shape.y*shape.y)*(1.-.73*smoothstep(.4,1.,t));
        eye.xyz+=across/max(length(across),.0001)*position.y*halfWidth*2.85;
        gl_Position=projectionMatrix*eye;
        strip=position.xy;pigment=shape.z;
        brightness=mix(.48,1.24,shape.w)*smoothstep(-114.,-30.,p.z)*
          (1.-smoothstep(11.,18.,z))*entry;
      }`,
    fragmentShader: `varying vec2 strip;varying float brightness;varying float pigment;
      uniform float spectrumPhase,boost;
      vec3 spectrum(float h){
        vec3 rgb=clamp(abs(fract(h+vec3(0.,.666667,.333333))*6.-3.)-1.,0.,1.);
        return rgb*rgb*(3.-2.*rgb);
      }
      void main(){
        float x=strip.x,y=strip.y;
        float ends=smoothstep(0.,.09,x)*(1.-smoothstep(.64,1.,x));
        float hue=pigment + (.06+.09*boost)*(x-.5) + .036*sin(spectrumPhase+6.283*pigment);
        vec3 coreTint=.012+1.5*spectrum(hue);
        vec3 haloTint=.008+1.32*spectrum(hue+.048*y);
        float core=exp(-y*y*34.), bloom=exp(-y*y*4.1);
        vec3 light=mix(haloTint,coreTint,core);
        light+=vec3(.29)*core*smoothstep(.36,.82,x);
        if(pigment>.968) light=mix(light,vec3(1.08,1.27,1.50),.78);
        float strength=(core*1.06+bloom*.43)*ends*brightness;
        gl_FragColor=vec4(light,strength);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new T.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 9;
  return {
    mesh,
    update(sim) {
      uniforms.travel.value = sim.distance % (132 / 0.72);
      uniforms.boost.value = T.MathUtils.smoothstep(sim.speed, 2, 70);
      uniforms.spectrumPhase.value = (sim.distance * 0.012) % (2 * Math.PI);
      uniforms.entry.value = T.MathUtils.smootherstep(sim.distance, 0.5, 27);
    },
  };
}
