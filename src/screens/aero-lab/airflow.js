/* SPDX-License-Identifier: MIT */
import {
  BufferGeometry,
  Float32BufferAttribute,
  ShaderMaterial,
  Mesh,
  DoubleSide,
  AdditiveBlending,
  Vector2,
  Vector3,
  CatmullRomCurve3,
} from 'three';

export function readings(kmh, yaw, section) {
  const angle = (Math.abs(yaw) * Math.PI) / 180,
    speed = kmh / 3.6;
  const q = 0.5 * 1.225 * speed * speed;
  const cd = 0.32 + 0.16 * Math.sin(angle) ** 2;
  const area = section.front * Math.cos(angle) + section.side * Math.sin(angle);
  return { force: q * cd * area, pressure: q / 1000, cd, area };
}

// Sample the loaded vehicle in longitudinal sections. A conservative three-bin
// maximum keeps the illustrative streamlines outside the roof and wheel arches.
export function carProfile(meshes, modelHeight, displayScale) {
  const count = 43,
    length = 5,
    height = new Float32Array(count),
    width = new Float32Array(count);
  const v = new Vector3();
  const columns = 19,
    halfSpan = 1.65;
  const surface = Array.from({ length: columns }, () => new Float32Array(count));
  // Integrate horizontal strips of the front and side silhouettes. Remove the
  // viewer's fit-to-camera scaling to recover square metres from the GLB.
  const bands = Array.from({ length: 48 }, () => ({
    left: Infinity,
    right: -Infinity,
    back: Infinity,
    nose: -Infinity,
  }));
  const step = Math.max(modelHeight, 0.001) / bands.length;
  for (const mesh of meshes) {
    const pos = mesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      const k = Math.max(0, Math.min(count - 1, Math.round((v.z / length + 0.5) * (count - 1))));
      height[k] = Math.max(height[k], v.y);
      width[k] = Math.max(width[k], Math.abs(v.x));
      const column = Math.min(columns - 1, Math.round((Math.abs(v.x) / halfSpan) * (columns - 1)));
      surface[column][k] = Math.max(surface[column][k], v.y);
      const band = bands[Math.max(0, Math.min(bands.length - 1, Math.floor((v.y - 0.006) / step)))];
      band.left = Math.min(band.left, v.x);
      band.right = Math.max(band.right, v.x);
      band.back = Math.min(band.back, v.z);
      band.nose = Math.max(band.nose, v.z);
    }
  }
  function smooth(values) {
    const pick = (v, i) => v[Math.max(0, Math.min(count - 1, i))];
    let samples = values.map((v, i) => Math.max(v, pick(values, i - 1), pick(values, i + 1)));
    for (let pass = 0; pass < 3; pass++) {
      const prev = samples;
      samples = prev.map(
        (v, i) =>
          (pick(prev, i - 2) +
            4 * pick(prev, i - 1) +
            6 * v +
            4 * pick(prev, i + 1) +
            pick(prev, i + 2)) /
          16,
      );
    }
    return samples;
  }
  const roof = smooth(height),
    sides = smooth(width);
  const sections = surface.map((row, j) =>
    smooth(
      row.map((h, i) =>
        Math.max(
          h,
          surface[Math.max(0, j - 1)][i] * 0.98,
          surface[Math.min(columns - 1, j + 1)][i] * 0.98,
        ),
      ),
    ),
  );
  function sample(values, z) {
    const f = Math.max(0, Math.min(count - 1, (z / length + 0.5) * (count - 1))),
      k = Math.floor(f);
    const at = (i) => values[i];
    return at(k) + (at(Math.min(count - 1, k + 1)) - at(k)) * (f - k);
  }
  const frontWidth = new Float32Array(bands.length),
    sideWidth = new Float32Array(bands.length);
  // Interpolate through heights with no sampled vertices on low-poly imports.
  let last = -1;
  for (const [i, b] of bands.entries()) {
    if (b.right < b.left) continue;
    frontWidth[i] = b.right - b.left;
    sideWidth[i] = b.nose - b.back;
    for (let j = last + 1; j < i; j++) {
      const t = (j - last) / (i - last);
      frontWidth[j] = last < 0 ? frontWidth[i] : frontWidth[last] * (1 - t) + frontWidth[i] * t;
      sideWidth[j] = last < 0 ? sideWidth[i] : sideWidth[last] * (1 - t) + sideWidth[i] * t;
    }
    last = i;
  }
  const area = (widths) => widths.reduce((sum, w) => sum + w * step, 0) / displayScale ** 2;
  return {
    section: { front: area(frontWidth), side: area(sideWidth) },
    sample(z, x) {
      const u = Math.min(columns - 1, (Math.abs(x) / halfSpan) * (columns - 1)),
        j = Math.floor(u);
      const a = sample(sections[j], z),
        b = sample(sections[Math.min(columns - 1, j + 1)], z);
      return {
        roof: Math.max(sample(roof, z) * 0.49, a + (b - a) * (u - j)),
        halfWidth: sample(sides, z),
      };
    },
  };
}

export function flowField(profile) {
  const steps = 156,
    lanes = 12,
    points = [],
    tangents = [],
    uvs = [],
    lanesAttr = [],
    indices = [];
  for (let lane = 0; lane < lanes; lane++)
    for (let j = 0; j <= steps; j++) {
      const a = (lane * (steps + 1) + j) * 2;
      for (const side of [-1, 1]) {
        points.push(0, 0, 0);
        tangents.push(0, 0, -1);
        uvs.push(j / steps, side);
        lanesAttr.push(lane);
      }
      if (j < steps) indices.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
    }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(points, 3));
  geometry.setAttribute('along', new Float32BufferAttribute(tangents, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('lane', new Float32BufferAttribute(lanesAttr, 1));
  geometry.setIndex(indices);
  const uniforms = {
    uPhase: { value: 0 },
    uStrength: { value: 1 },
    uViewport: { value: new Vector2(1280, 540) },
  };
  const material = new ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    forceSinglePass: true,
    blending: AdditiveBlending,
    vertexShader: `attribute vec3 along;attribute float lane;uniform vec2 uViewport;
      varying vec2 ribbon;varying float strand;varying float station;
      void main(){vec4 c=projectionMatrix*modelViewMatrix*vec4(position,1.);
        vec4 d=projectionMatrix*modelViewMatrix*vec4(along,0.);
        vec2 tangent=(d.xy*c.w-c.xy*d.w)*uViewport;
        vec2 side=vec2(-tangent.y,tangent.x)/max(length(tangent),.0001);
        c.xy+=side*uv.y*(6.4+.85*cos(lane*1.8))/uViewport*c.w;
        gl_Position=c;ribbon=uv;strand=lane;station=position.z;}`,
    fragmentShader: `uniform float uPhase,uStrength;varying vec2 ribbon;varying float strand;
      varying float station;
      void main(){
        float seed=fract(strand*.618034),y=ribbon.y;
        float along=fract(ribbon.x/6.35-uPhase+seed*.52);
        float glint=exp(-pow((along-.54)/.175,2.));
        float core=exp(-y*y*38.), shoulder=exp(-y*y*11.), halo=exp(-y*y*3.1);
        float taper=(1.-smoothstep(4.15,7.,abs(station)))*mix(1.,.46,smoothstep(1.5,5.5,-station));
        float filament=mix(.44,.73,seed)+glint*.43;
        if(strand>=8.)filament*=.50;
        vec3 silver=mix(vec3(.55,.69,.73),vec3(1.28,1.33,1.35),core+glint*.18);
        float opacity=(filament*core+.20*shoulder+.065*halo)*taper*uStrength;
        gl_FragColor=vec4(silver,opacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new Mesh(geometry, material);
  mesh.renderOrder = 8;
  mesh.visible = false;
  mesh.frustumCulled = false;
  const samples = Array.from({ length: steps + 1 }, () => new Vector3());
  const tangent = new Vector3();
  let revision = 0;
  function setYaw(degrees) {
    revision++;
    const drift = Math.tan((degrees * Math.PI) / 180);
    const stations = [
      7, 5.2, 3.65, 2.8, 2.35, 1.91, 1.35, 0.78, 0.16, -0.48, -1.12, -1.76, -2.34, -2.96, -3.85,
      -5.1, -7,
    ];
    const envelopeAt = (z) =>
      Math.exp(-(Math.max(0, Math.abs(z) - 2.3) ** 2) / (z > 0 ? 3.2 : 4.2));
    const pos = geometry.attributes.position,
      dir = geometry.attributes.along;
    for (let lane = 0; lane < lanes; lane++) {
      const crown = lane < 8,
        side = lane % 2 === 0 ? -1 : 1;
      const offset = crown
        ? (lane - 3.5) * 0.242
        : side * (0.9 + 0.13 * Math.floor((lane - 8) / 2));
      const guides = stations.map((z) => {
        const envelope = envelopeAt(z);
        const localX = offset - drift * z * (1 - 0.48 * envelope);
        const { roof, halfWidth } = profile(z, localX);
        const layer = crown ? 0.055 + 0.035 * (1 - Math.abs(offset)) : 0.08;
        const ambient = z > 0 ? 0.17 + 0.032 * offset : 0.52 + 0.025 * offset;
        const crownHeight = Math.max(roof, 0.71 * profile(z, 0).roof + 0.29 * roof);
        const roofY = ambient + (crownHeight + layer - ambient) * envelope;
        const sideY = 0.32 + 0.14 * Math.floor((lane - 8) / 2) + 0.16 * envelope;
        const clearance = Math.max(
          0,
          halfWidth + 0.044 + 0.077 * Math.floor((lane - 8) / 2) - side * localX,
        );
        const x = crown ? localX * (1 + 0.035 * envelope) : localX + side * clearance * envelope;
        return new Vector3(x, crown ? roofY : sideY, z);
      });
      if (crown) {
        // A streamline bridges the rear glass, engine cover and spoiler.
        // Limit descent into their gaps and fair the transitions at both ends.
        for (let k = 1; k < guides.length; k++) {
          const previous = guides[k - 1],
            p = guides[k];
          p.y = Math.max(p.y, previous.y - 0.155 * (previous.z - p.z));
        }
        for (let k = guides.length - 2; k >= 0; k--) {
          const next = guides[k + 1],
            p = guides[k];
          p.y = Math.max(p.y, next.y - 0.48 * (p.z - next.z));
        }
        const heights = guides.map((p) => p.y);
        for (let k = 1; k < guides.length - 1; k++)
          guides[k].y =
            0.22 * heights[k - 1] +
            0.56 * heights[k] +
            0.22 * heights[k + 1] +
            0.018 * envelopeAt(guides[k].z);
      }
      const curve = new CatmullRomCurve3(guides, false, 'centripetal');
      for (let j = 0; j <= steps; j++) curve.getPoint(j / steps, samples[j]);
      let arc = 0;
      for (let j = 0; j <= steps; j++) {
        const p = samples[j];
        if (j) arc += p.distanceTo(samples[j - 1]);
        tangent
          .subVectors(samples[Math.min(j + 1, steps)], samples[Math.max(j - 1, 0)])
          .normalize();
        const i = (lane * (steps + 1) + j) * 2;
        for (const k of [i, i + 1]) {
          pos.setXYZ(k, p.x, p.y, p.z);
          dir.setXYZ(k, tangent.x, tangent.y, tangent.z);
          geometry.attributes.uv.setX(k, arc);
        }
      }
    }
    pos.needsUpdate = dir.needsUpdate = geometry.attributes.uv.needsUpdate = true;
  }
  setYaw(0);
  return {
    mesh,
    emitters: [mesh],
    get revision() {
      return revision;
    },
    setYaw,
    resize(w, h) {
      uniforms.uViewport.value.set(w, h);
    },
    advance(dt, speed) {
      if (dt * speed || uniforms.uStrength.value !== Math.min(1, speed / 35)) revision++;
      uniforms.uPhase.value = (uniforms.uPhase.value + (dt * speed) / 245) % 1;
      uniforms.uStrength.value = Math.min(1, speed / 35);
    },
  };
}
