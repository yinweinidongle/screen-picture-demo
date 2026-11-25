/* SPDX-License-Identifier: MIT */
import * as T from 'three';
import { beamCount } from './radar.js';

// One camera-facing ribbon per transmitted bearing. The measured first
// surface terminates the geometry itself, including in the body reflections.
export function radarRays() {
  const geometry = new T.InstancedBufferGeometry();
  geometry.setAttribute(
    'position',
    new T.Float32BufferAttribute([0, -1, 0, 0, 1, 0, 1, -1, 0, 1, 1, 0], 3),
  );
  geometry.setIndex([0, 1, 2, 2, 1, 3]);
  const rays = new T.InstancedBufferAttribute(new Float32Array(beamCount * 4), 4).setUsage(
    T.DynamicDrawUsage,
  );
  const returns = new T.InstancedBufferAttribute(new Float32Array(beamCount), 1).setUsage(
    T.DynamicDrawUsage,
  );
  geometry.setAttribute('ray', rays);
  geometry.setAttribute('vehicleEcho', returns);
  geometry.instanceCount = beamCount;
  const material = new T.ShaderMaterial({
    transparent: true,
    blending: T.AdditiveBlending,
    side: T.DoubleSide,
    forceSinglePass: true,
    depthWrite: false,
    vertexShader: `attribute vec4 ray;attribute float vehicleEcho;
      varying vec4 beam;varying float echo;
      void main(){
        vec3 direction=vec3(ray.x,0.,ray.y);
        vec4 eye=modelViewMatrix*vec4(vec3(0.,.48,0.)+direction*position.x*ray.z,1.);
        vec3 side=cross(mat3(modelViewMatrix)*direction,-eye.xyz);
        float width=.047+clamp(-eye.z*.0016,0.,.09);
        eye.xyz+=side/max(length(side),.0001)*position.y*width;
        beam=vec4(position.xy,ray.z,ray.w);echo=vehicleEcho;
        gl_Position=projectionMatrix*eye;
        if(ray.w<.005||ray.z<.08)gl_Position=vec4(2.,2.,2.,1.);
      }`,
    fragmentShader: `varying vec4 beam;varying float echo;
      void main(){
        float t=beam.x,across=beam.y,lengthM=beam.z;
        float core=exp(-32.*across*across),glow=exp(-4.2*across*across);
        float tip=exp(-pow((1.-t)*lengthM/.58,2.));
        float shaft=(.43+.36*t)*smoothstep(.1,.9,t*lengthM);
        vec3 cold=mix(vec3(.032,.51,.68),vec3(.52,1.10,1.16),core);
        vec3 light=mix(cold,vec3(1.65,.69,.18),tip*echo);
        float alpha=beam.w*((core*.85+glow*.20)*shaft+tip*(core*.69+glow*.26));
        gl_FragColor=vec4(light,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new T.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 6;
  return {
    mesh,
    update(sim) {
      mesh.position.x = sim.x;
      for (let i = 0; i < sim.radar.beams.length; i++) {
        const b = sim.radar.beams[i];
        rays.setXYZW(i, b.direction.x, b.direction.z, b.length, b.energy);
        returns.setX(i, Number(!!b.vehicleHit));
      }
      rays.needsUpdate = returns.needsUpdate = true;
    },
  };
}
