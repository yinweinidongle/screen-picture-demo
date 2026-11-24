/* SPDX-License-Identifier: MIT */
import {
  BufferGeometry,
  Float32BufferAttribute,
  ShaderMaterial,
  Mesh,
  DoubleSide,
  AdditiveBlending,
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
    sample: (z) => ({ roof: sample(roof, z), halfWidth: sample(sides, z) }),
  };
}

export function flowField(profile) {
  const steps = 116,
    lanes = 24,
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
  const uniforms = { uPhase: { value: 0 }, uStrength: { value: 1 } };
  const material = new ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    forceSinglePass: true,
    blending: AdditiveBlending,
    vertexShader: `attribute vec3 along;attribute float lane;
      varying vec2 ribbon;varying float strand;
      void main(){vec4 c=modelViewMatrix*vec4(position,1.);
        vec3 tangent=mat3(modelViewMatrix)*along;
        vec3 side=cross(tangent,-c.xyz);c.xyz+=side/max(length(side),.001)*uv.y*.014;
        gl_Position=projectionMatrix*c;ribbon=uv;strand=lane;}`,
    fragmentShader: `uniform float uPhase,uStrength;varying vec2 ribbon;varying float strand;
      void main(){float pulse=fract(ribbon.x*2.4-uPhase+strand*.217);
        float tail=pow(pulse,7.)*(1.-smoothstep(.98,1.,pulse));
        float edge=exp(-ribbon.y*ribbon.y*3.8);
        float ends=smoothstep(0.,.08,ribbon.x)*(1.-smoothstep(.89,1.,ribbon.x));
        vec3 col=mix(vec3(.17,.64,.77),vec3(.8,1.,.80),tail);
        gl_FragColor=vec4(col,edge*ends*uStrength*(.185+.68*tail));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new Mesh(geometry, material);
  mesh.renderOrder = 8;
  mesh.visible = false;
  mesh.frustumCulled = false;
  const p = new Vector3(),
    before = new Vector3(),
    after = new Vector3();
  function setYaw(degrees) {
    const drift = Math.tan((degrees * Math.PI) / 180);
    function point(lane, t, out) {
      const z = 6.6 - t * 13.2,
        above = lane < 12;
      const side = lane % 2 === 0 ? -1 : 1;
      const flat = above
        ? (lane - 5.5) * 0.225
        : side * (0.6 + (Math.floor((lane - 12) / 2) % 3) * 0.32);
      const y0 = above ? 0.32 + (lane % 3) * 0.095 : 0.19 + Math.floor((lane - 12) / 6) * 0.36;
      const wake = Math.max(0, -z - 2.2);
      const decay = Math.exp(-(Math.max(0, Math.abs(z) - 2.36) ** 2) / (z < 0 ? 2.2 : 0.95));
      const { roof, halfWidth } = profile(z);
      const x0 = flat - drift * z;
      const y = above
        ? y0 + Math.max(0, roof + 0.12 + 0.085 * (lane % 3) - y0) * decay
        : y0 + 0.055 * decay;
      const x = above ? x0 : x0 + side * Math.max(0, halfWidth + 0.13 - side * x0) * decay;
      out.set(
        x + Math.sin(wake * 3.3 + lane) * 0.075 * Math.min(wake, 1) * Math.exp(-wake * 0.35),
        y,
        z,
      );
    }
    const pos = geometry.attributes.position,
      dir = geometry.attributes.along;
    for (let lane = 0; lane < lanes; lane++)
      for (let j = 0; j <= steps; j++) {
        const t = j / steps;
        point(lane, t, p);
        point(lane, Math.max(0, t - 0.003), before);
        point(lane, Math.min(1, t + 0.003), after);
        after.sub(before).normalize();
        const i = (lane * (steps + 1) + j) * 2;
        for (const k of [i, i + 1]) {
          pos.setXYZ(k, p.x, p.y, p.z);
          dir.setXYZ(k, after.x, after.y, after.z);
        }
      }
    pos.needsUpdate = dir.needsUpdate = true;
  }
  setYaw(0);
  return {
    mesh,
    setYaw,
    advance(dt, speed) {
      uniforms.uPhase.value = (uniforms.uPhase.value + (dt * speed) / 200) % 1;
      uniforms.uStrength.value = Math.min(1, speed / 35);
    },
  };
}
