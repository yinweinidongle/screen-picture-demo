/* SPDX-License-Identifier: MIT */
import { CatmullRomCurve3, Vector3, BufferGeometry, Float32BufferAttribute } from 'three';
const tau = Math.PI * 2;
const vec = (x, y, z) => new Vector3(x, y, z);
function randomStream() {
  let state = 370913;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function civicCanopy() {
  const random = randomStream(),
    branches = [],
    stars = [],
    anchors = [];
  function grow(parent, joint, knots, radius, tip, sector, level) {
    const points = knots.map((p) => vec(...p));
    if (parent) points.unshift(parent.curve.getPointAt(joint));
    const curve = new CatmullRomCurve3(points);
    const length = curve.getLength();
    const branch = {
      curve,
      length,
      start: parent ? parent.start + parent.length * joint : 0,
      radius,
      tip,
      sector,
      level,
      seed: random() * tau,
    };
    branches.push(branch);
    return branch;
  }
  const trunk = grow(
    null,
    0,
    [
      [0, 0, 0],
      [-0.21, 0.55, 0.12],
      [-0.05, 1.19, 0.19],
      [0.4, 1.91, 0.08],
      [0.27, 2.48, -0.09],
      [-0.12, 3.06, -0.16],
      [0.04, 3.64, -0.18],
      [0.51, 4.16, -0.3],
      [0.68, 4.76, -0.24],
      [0.52, 5.11, -0.08],
    ],
    0.39,
    0.023,
    -1,
    0,
  );
  const boughs = [];
  function bough(joint, coords, r, group, pin = false) {
    const b = grow(trunk, joint, coords, r, 0.012, group, 1);
    boughs.push(b);
    if (pin) anchors[group] = b.curve.getPointAt(0.91);
  }
  bough(
    0.23,
    [
      [-0.48, 1.4, 0.37],
      [-1.24, 1.58, 0.56],
      [-2.1, 1.49, 0.63],
      [-2.92, 1.85, 0.55],
      [-3.62, 2.07, 0.72],
      [-4.29, 2.06, 0.6],
      [-4.7, 2.4, 0.57],
    ],
    0.205,
    0,
    true,
  );
  bough(
    0.4,
    [
      [-0.12, 2.3, -0.53],
      [-0.96, 2.48, -1.0],
      [-1.71, 2.82, -1.09],
      [-2.65, 2.8, -1.28],
      [-3.46, 3.16, -1.15],
    ],
    0.166,
    0,
  );
  bough(
    0.36,
    [
      [-0.29, 2.36, 0.16],
      [-0.88, 2.78, 0.25],
      [-1.24, 3.39, 0.45],
      [-2.04, 3.78, 0.55],
      [-2.84, 3.94, 0.62],
      [-3.42, 4.36, 0.74],
      [-3.82, 4.68, 0.8],
    ],
    0.228,
    1,
    true,
  );
  bough(
    0.58,
    [
      [-0.61, 3.32, -0.27],
      [-1.13, 3.96, -0.13],
      [-1.25, 4.6, -0.19],
      [-1.68, 5.11, -0.12],
      [-2.19, 5.28, 0.07],
    ],
    0.158,
    1,
  );
  bough(
    0.67,
    [
      [0.23, 3.79, 0.18],
      [0.48, 4.26, 0.51],
      [0.78, 4.73, 0.69],
      [0.9, 5.27, 0.54],
      [1.42, 5.7, 0.46],
    ],
    0.137,
    2,
    true,
  );
  bough(
    0.48,
    [
      [0.64, 2.75, 0.13],
      [1.36, 3.07, 0.24],
      [1.82, 3.66, 0.12],
      [2.42, 4.12, 0.04],
      [3.08, 4.25, -0.11],
      [3.63, 4.66, -0.22],
    ],
    0.207,
    2,
  );
  bough(
    0.77,
    [
      [0.34, 4.36, -0.58],
      [-0.04, 4.86, -0.85],
      [-0.26, 5.24, -1.13],
      [-0.1, 5.67, -1.19],
    ],
    0.109,
    1,
  );
  bough(
    0.28,
    [
      [0.47, 1.66, 0.31],
      [1.1, 1.95, 0.55],
      [1.9, 2.03, 0.72],
      [2.58, 2.48, 0.65],
      [3.45, 2.53, 0.54],
      [4.12, 2.76, 0.49],
      [4.47, 3.13, 0.57],
    ],
    0.202,
    3,
    true,
  );
  bough(
    0.43,
    [
      [0.87, 2.62, -0.54],
      [1.41, 2.7, -0.97],
      [2.15, 3.01, -1.28],
      [3.02, 3.04, -1.37],
      [3.89, 3.48, -1.32],
    ],
    0.164,
    3,
  );
  bough(
    0.35,
    [
      [0.38, 1.97, -0.65],
      [0.18, 2.5, -1.23],
      [-0.36, 3.1, -1.78],
      [-0.72, 3.42, -2.13],
    ],
    0.14,
    0,
  );

  for (let n = 0; n < 17; n++) {
    const a = (n * tau) / 17 + random() * 0.18,
      extent = 1.18 + random() * 1.16;
    const points = [0.31, 0.56, 0.83, 1].map((t, i) => [
      Math.cos(a + t * 0.32) * extent * t,
      0.018 + (1 - t) ** 3 * 0.47 + Math.sin(i * 2) * 0.018,
      Math.sin(a + t * 0.32) * extent * t,
    ]);
    grow(trunk, 0.06 + random() * 0.047, points, 0.084 + random() * 0.08, 0.005, -1, 2);
  }
  function offshoot(parent, t, dx, dy, dz, r, level) {
    const base = parent.curve.getPointAt(t),
      sway = (random() - 0.5) * 0.5;
    const points = [0.25, 0.52, 0.78, 1].map((u, i) => [
      base.x + dx * u + Math.sin(u * Math.PI) * sway,
      base.y + dy * u + (i === 1 ? -0.08 : 0.045) * Math.abs(dy),
      base.z + dz * u + Math.sin(u * Math.PI) * 0.19 * (dy - dx * 0.2),
    ]);
    return grow(parent, t, points, r, 0.005, parent.sector, level);
  }
  for (const b of boughs) {
    const end = b.curve.getPointAt(1),
      side = Math.sign(end.x) || 1;
    for (let k = 0; k < 6; k++) {
      const t = 0.23 + k * 0.126 + random() * 0.028;
      const outward = (k % 3 === 0 ? -0.16 : 0.48) + random() * 0.57;
      const up = k % 3 === 1 ? 0.22 + random() * 0.37 : 0.64 + random() * 0.57;
      const dz = (k % 2 === 0 ? -1 : 1) * (0.32 + random() * 0.72);
      const twig = offshoot(b, t, side * outward, up, dz, 0.033 + (1 - t) * 0.073, 2);
      for (let j = 0; j < 3; j++) {
        offshoot(
          twig,
          0.35 + j * 0.245,
          side * (random() * 0.65 - 0.2),
          0.18 + random() * 0.44,
          (random() - 0.5) * 0.83,
          0.013 + random() * 0.016,
          3,
        );
      }
    }
  }
  // Grain is concentrated around twig tips. The open gaps reveal the larger limbs.
  for (const b of branches) {
    if (b.level < 2 || b.sector < 0) continue;
    const end = b.curve.getPointAt(1);
    stars.push([
      end.x,
      end.y,
      end.z,
      b.sector,
      b.start + b.length,
      1.7 + random() * 0.9,
      random(),
      1,
    ]);
    const count = b.level === 3 ? 90 : 48;
    for (let i = 0; i < count; i++) {
      const t = 0.42 + random() * 0.58,
        p = b.curve.getPointAt(t),
        a = random() * tau;
      const r = Math.pow(random(), 0.65) * (0.25 + 0.41 * t);
      p.x += Math.cos(a) * r * (0.95 + random());
      p.y += (random() - 0.42) * r * 1.39;
      p.z += Math.sin(a) * r + (random() - 0.5) * 0.16;
      stars.push([
        p.x,
        p.y,
        p.z,
        b.sector,
        b.start + b.length * t,
        0.48 + random() ** 3 * 1.15,
        random(),
        0,
      ]);
    }
  }
  for (let i = 0; i < 1200; i++) {
    const r = Math.pow(random(), 0.67) * 2.35,
      a = random() * tau;
    stars.push([
      Math.cos(a) * r,
      0.028 + random() ** 3 * 0.13,
      Math.sin(a) * r,
      -1,
      r,
      0.38 + random() * 0.64,
      random(),
      0,
    ]);
  }
  return { branches, stars, anchors };
}

export function woodGeometry(branches) {
  const pos = [],
    normal = [],
    trace = [],
    meta = [],
    girth = [],
    indices = [];
  for (const b of branches) {
    const steps = Math.max(8, Math.ceil(b.length * (b.level < 2 ? 12 : 8))),
      sides = [26, 16, 9, 6][b.level];
    const frames = b.curve.computeFrenetFrames(steps, false);
    const first = pos.length / 3;
    for (let j = 0; j <= steps; j++) {
      const t = j / steps,
        p = b.curve.getPointAt(t),
        radius = b.tip + (b.radius - b.tip) * (1 - t) ** 0.8;
      for (let k = 0; k <= sides; k++) {
        const a = (k / sides) * tau,
          d = frames.normals[j]
            .clone()
            .multiplyScalar(Math.cos(a))
            .addScaledVector(frames.binormals[j], Math.sin(a));
        const ridge =
          1 + 0.12 * Math.cos(5 * a + 2.7 * t + b.seed) + 0.035 * Math.sin(9 * a - 4 * t);
        pos.push(
          p.x + d.x * radius * ridge,
          p.y + d.y * radius * ridge,
          p.z + d.z * radius * ridge,
        );
        normal.push(d.x, d.y, d.z);
        trace.push(k / sides, b.start + b.length * t);
        meta.push(b.sector, b.seed);
        girth.push(radius);
        if (j < steps && k < sides) {
          const v = first + j * (sides + 1) + k;
          indices.push(v, v + 1, v + sides + 1, v + 1, v + sides + 2, v + sides + 1);
        }
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setIndex(indices);
  for (const [name, values, size] of [
    ['position', pos, 3],
    ['normal', normal, 3],
    ['trace', trace, 2],
    ['meta', meta, 2],
    ['girth', girth, 1],
  ])
    geometry.setAttribute(name, new Float32BufferAttribute(values, size));
  return geometry;
}
