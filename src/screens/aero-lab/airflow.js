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
    lanes = 40,
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
        c.xy+=side*uv.y*(3.4+1.5*fract(lane*.618))/uViewport*c.w;
        gl_Position=c;ribbon=uv;strand=lane;station=position.z;}`,
    fragmentShader: `uniform float uPhase,uStrength;varying vec2 ribbon;varying float strand;
      varying float station;
      void main(){float seed=fract(strand*.618034);
        float p=fract(ribbon.x*.34-uPhase+seed*2.7);
        float pulse=exp(-pow((p-.75)/mix(.19,.026,step(.75,p)),2.));
        float d=ribbon.y*ribbon.y;
        float core=exp(-d*13.), veil=exp(-d*3.8);
        float ends=1.-smoothstep(4.45,7.,abs(station));
        vec3 col=mix(vec3(.27,.62,.70),vec3(.76,1.,1.),pulse);
        float opacity=(.18+.25*seed+.54*pulse)*core+.08*veil;
        gl_FragColor=vec4(col,opacity*ends*uStrength);
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
  function setYaw(degrees) {
    const drift = Math.tan((degrees * Math.PI) / 180);
    function point(lane, t, out) {
      const z = 7 - t * 14,
        above = lane < 22,
        side = lane % 2 === 0 ? -1 : 1;
      const band = Math.floor((lane - 22) / 2),
        seed = (lane * 0.618034) % 1;
      const flat = above ? (lane - 10.5) * 0.115 : side * (0.75 + (band % 3) * 0.19);
      const y0 = above ? 0.39 + 0.34 * seed : 0.15 + band * 0.098;
      const wake = Math.max(0, -z - 2.25);
      const influence = Math.exp(-(Math.max(0, Math.abs(z) - 2.32) ** 2) / (z < 0 ? 3.8 : 0.95));
      const x0 = flat - drift * z;
      const { roof, halfWidth } = profile(z, x0);
      const lift = roof + 0.075 + 0.12 * seed - y0;
      const y = above
        ? y0 + 0.5 * (lift + Math.hypot(lift, 0.09)) * influence
        : y0 + 0.075 * influence;
      const shift = halfWidth + 0.065 + 0.043 * band - side * x0;
      const x = above
        ? x0 + flat * 0.09 * influence
        : x0 + side * 0.5 * (shift + Math.hypot(shift, 0.08)) * influence;
      const vortex = (above ? 0.033 : 0.085) * wake * Math.exp(-wake * 0.67);
      out.set(
        x + vortex * Math.sin(wake * 2.2 + lane * 0.7),
        y + vortex * Math.cos(wake * 2.2 + lane * 0.7),
        z,
      );
    }
    const pos = geometry.attributes.position,
      dir = geometry.attributes.along;
    for (let lane = 0; lane < lanes; lane++) {
      for (let j = 0; j <= steps; j++) point(lane, j / steps, samples[j]);
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
    setYaw,
    resize(w, h) {
      uniforms.uViewport.value.set(w, h);
    },
    advance(dt, speed) {
      uniforms.uPhase.value = (uniforms.uPhase.value + (dt * speed) / 200) % 1;
      uniforms.uStrength.value = Math.min(1, speed / 35);
    },
  };
}
