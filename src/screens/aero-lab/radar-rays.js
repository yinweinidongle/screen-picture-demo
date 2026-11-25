/* SPDX-License-Identifier: MIT */
import * as T from 'three';
import { radarSegmentCount } from './radar.js';

// Both endpoints arrive in road coordinates. Draw only the occupied interval
// of each travelling packet so the dark gaps also appear in the paint reflections.
export function radarRays() {
  const geometry = new T.InstancedBufferGeometry();
  geometry.setAttribute(
    'position',
    new T.Float32BufferAttribute([0, -1, 0, 0, 1, 0, 1, -1, 0, 1, 1, 0], 3),
  );
  geometry.setIndex([0, 1, 2, 2, 1, 3]);
  const ends = new T.InstancedBufferAttribute(new Float32Array(radarSegmentCount * 4), 4).setUsage(
    T.DynamicDrawUsage,
  );
  const signal = new T.InstancedBufferAttribute(
    new Float32Array(radarSegmentCount * 2),
    2,
  ).setUsage(T.DynamicDrawUsage);
  geometry.setAttribute('segmentEnds', ends);
  geometry.setAttribute('segmentSignal', signal);
  geometry.instanceCount = radarSegmentCount;
  const material = new T.ShaderMaterial({
    transparent: true,
    blending: T.AdditiveBlending,
    side: T.DoubleSide,
    forceSinglePass: true,
    depthWrite: false,
    vertexShader: `attribute vec4 segmentEnds;
      attribute vec2 segmentSignal;
      varying vec4 ribbon;varying float echo;
      void main(){
        vec2 start=segmentEnds.xy, end=segmentEnds.zw, delta=end-start;
        float span=length(delta);
        ribbon=vec4(position.xy,span,segmentSignal.x); echo=segmentSignal.y;
        if(segmentSignal.x<.005||span<.015){gl_Position=vec4(2.,2.,2.,1.);return;}
        vec2 p=mix(start,end,position.x);
        vec4 eye=modelViewMatrix*vec4(p.x,.48,p.y,1.);
        vec3 across=cross(mat3(modelViewMatrix)*vec3(delta.x,0.,delta.y),-eye.xyz);
        float width=.060+clamp(-eye.z*.0015,0.,.078);
        eye.xyz+=across/max(length(across),.0001)*position.y*width;
        gl_Position=projectionMatrix*eye;
      }`,
    fragmentShader: `varying vec4 ribbon;varying float echo;
      void main(){
        float t=ribbon.x,y=ribbon.y,span=ribbon.z;
        float fromTail=t*span,toHead=(1.-t)*span;
        float ends=smoothstep(0.,.10,fromTail)*smoothstep(0.,.045,toHead);
        float core=exp(-24.*y*y),halo=exp(-3.5*y*y);
        float leading=smoothstep(.36,.92,t),tip=exp(-toHead*toHead/.045);
        vec3 color=mix(vec3(.015,.62,.89),vec3(.33,1.39,1.60),core*(.45+.55*leading));
        color=mix(color,vec3(1.80,.77,.23),echo*tip);
        float alpha=ribbon.w*ends*((.63+.32*leading)*core+.21*halo+.22*tip*core);
        gl_FragColor=vec4(color,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new T.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 8;
  return {
    mesh,
    update(sim) {
      for (let i = 0; i < sim.radar.segments.length; i++) {
        const s = sim.radar.segments[i];
        ends.setXYZW(i, s.startX, s.startZ, s.endX, s.endZ);
        signal.setXY(i, s.energy, Number(s.vehicleHit));
      }
      ends.needsUpdate = signal.needsUpdate = true;
    },
  };
}
