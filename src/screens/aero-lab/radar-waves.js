/* SPDX-License-Identifier: MIT */
import * as T from 'three';
import { radarBins, radarRange } from './radar.js';

// Three narrow annuli share one draw. Polar depth samples carry the first
// contact for each emitted wave, including sectors absorbed on previous scans.
export function radarWaves() {
  const rows = 3,
    coords = [],
    indices = [];
  for (let row = 0; row < rows; row++)
    for (let i = 0; i <= radarBins; i++) {
      const base = coords.length / 3;
      coords.push(i / radarBins, -1, row, i / radarBins, 1, row);
      if (i < radarBins) indices.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
    }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(coords, 3));
  g.setIndex(indices);
  const bytes = new Uint8Array(rows * radarBins);
  const depths = new T.DataTexture(bytes, radarBins, rows, T.RedFormat);
  depths.magFilter = depths.minFilter = T.NearestFilter;
  depths.wrapS = T.RepeatWrapping;
  const pulses = Array.from({ length: rows }, () => new T.Vector3());
  const material = new T.ShaderMaterial({
    uniforms: {
      pulses: { value: pulses },
      depths: { value: depths },
      range: { value: radarRange },
    },
    transparent: true,
    blending: T.AdditiveBlending,
    side: T.DoubleSide,
    forceSinglePass: true,
    depthWrite: false,
    vertexShader: `uniform vec3 pulses[3];uniform float range;
      varying vec4 wave;
      void main(){
        vec3 p=pulses[int(position.z)];float angle=position.x*6.2831853;
        float width=.22+p.z*.009;
        float radius=max(0.,p.z+position.y*width);
        vec2 ground=p.xy+vec2(sin(angle),cos(angle))*radius;
        wave=vec4(position.x,(position.z+.5)/3.,position.y,radius);
        gl_Position=projectionMatrix*modelViewMatrix*vec4(ground.x,.086,ground.y,1.);
        if(p.z<.2||p.z>range)gl_Position=vec4(2.,2.,2.,1.);
      }`,
    fragmentShader: `uniform sampler2D depths;uniform float range;varying vec4 wave;
      void main(){
        float u=wave.x+.5/${radarBins.toFixed(1)};
        float hit=min(texture2D(depths,vec2(u-.42/${radarBins.toFixed(1)},wave.y)).r,
                      texture2D(depths,vec2(u+.42/${radarBins.toFixed(1)},wave.y)).r)*range;
        float absorb=1.-smoothstep(hit-.35,hit,wave.w);
        float y=wave.z,core=exp(-32.*y*y),glow=exp(-4.3*y*y);
        float strength=absorb*(.74*core+.22*glow)*(1.-smoothstep(29.,range,wave.w));
        gl_FragColor=vec4(mix(vec3(.04,.65,.92),vec3(.62,1.15,1.18),core),strength);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new T.Mesh(g, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 6;
  material.addEventListener('dispose', () => depths.dispose());
  let version = -1,
    lastTime = -1;
  return {
    mesh,
    update(sim) {
      const changed = version !== sim.radar.version || sim.time < lastTime;
      for (let row = 0; row < rows; row++) {
        const p = sim.radar.pulses[row];
        pulses[row].set(p.x, p.s - sim.distance, p.radius);
        if (changed)
          for (let i = 0; i < radarBins; i++)
            bytes[row * radarBins + i] = Math.min(
              255,
              Math.floor((p.visibleTo[i] / radarRange) * 255),
            );
      }
      if (changed) depths.needsUpdate = true;
      version = sim.radar.version;
      lastTime = sim.time;
    },
  };
}
