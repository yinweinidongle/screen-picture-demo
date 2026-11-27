/* SPDX-License-Identifier: MIT */
import * as T from 'three';

const vec = (x, y, z) => new T.Vector3(x, y, z);
const tau = Math.PI * 2;
function batch() {
  return {
    p: [],
    uv: [],
    info: [],
    anchor: [],
    indices: [],
    vertex(v, u, t, kind = 0, seed = 0, id = -1, anchor = v) {
      const i = this.p.length / 3;
      this.p.push(v.x, v.y, v.z);
      this.uv.push(u, t);
      this.info.push(kind, seed, id);
      this.anchor.push(anchor.x, anchor.y, anchor.z);
      return i;
    },
    quad(a, b, c, d) {
      this.indices.push(a, b, d, b, c, d);
    },
    finish() {
      const g = new T.BufferGeometry();
      for (const [name, values, size] of [
        ['position', this.p, 3],
        ['uv', this.uv, 2],
        ['part', this.info, 3],
        ['anchor', this.anchor, 3],
      ])
        g.setAttribute(name, new T.Float32BufferAttribute(values, size));
      g.setIndex(this.indices);
      g.computeVertexNormals();
      return g;
    },
  };
}

function tube(batch, points, r1, r2, kind, steps = 15, sides = 8) {
  const curve = new T.CatmullRomCurve3(points),
    frames = curve.computeFrenetFrames(steps, false);
  let prev = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps,
      p = curve.getPointAt(t),
      r = T.MathUtils.lerp(r1, r2, t),
      row = [];
    for (let j = 0; j < sides; j++) {
      const a = (j * tau) / sides;
      const v = p
        .clone()
        .addScaledVector(frames.normals[i], Math.cos(a) * r)
        .addScaledVector(frames.binormals[i], Math.sin(a) * r);
      row.push(batch.vertex(v, j / sides, t, kind));
    }
    if (i)
      for (let j = 0; j < sides; j++)
        batch.quad(prev[j], prev[(j + 1) % sides], row[(j + 1) % sides], row[j]);
    prev = row;
  }
  return curve;
}

export function createSpecimenModel() {
  const stems = batch(),
    berries = batch(),
    flowers = batch();
  const leaves = [],
    fruits = [],
    parts = [];
  let seed = 1931;
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const stemAt = (y) => vec(0.032 * Math.sin(y * 1.55), y, 0.028 * Math.sin(y * 1.6));
  const crownAt = (y) =>
    vec(Math.max(0, y - 1.1) * 0.41, y, -0.15 * Math.min(1, Math.max(0, y - 1.1)));
  function branch(points, r1, r2, kind = 0, steps = 14, sides = 8) {
    const curve = tube(stems, points, r1, r2, kind, steps, sides);
    parts.push({ points: curve.getPoints(steps), r: r1, kind });
    return curve;
  }
  branch([-0.16, 0.7, 1.2, 2.0, 2.6, 3.12, 3.48].map(stemAt), 0.1, 0.028, 0, 56, 12);
  branch([1.1, 1.48, 2.12, 2.74, 3.5, 4.05, 4.42].map(crownAt), 0.082, 0.02, 0, 44, 10);

  const blades = [];
  // Each terminal blade and its basal pair share a petiolule; the clusters splay
  // at different depths and roll independently around the central rachis.
  const landmark = (x, y, z) => vec((x - 331) / 102, (565 - y) / 105 + 0.08 * z, z);
  function blade(at, end, halfWidth, tile, roll) {
    const d = end.clone().sub(at),
      span = d.length(),
      dir = d.clone().normalize(),
      across = vec(dir.y, -dir.x, 0).normalize();
    across.applyAxisAngle(dir, roll);
    const face = new T.Vector3().crossVectors(across, dir).normalize();
    if (face.z < 0) face.negate();
    blades.push({
      at,
      d,
      span,
      across,
      face,
      halfWidth,
      tile,
      twist: (random() - 0.5) * 1.05,
      curve: (random() - 0.5) * 0.17,
      fold: 0.26 + random() * 0.22,
      seed: random(),
    });
  }
  function spray(base, h, clusters) {
    const hub = landmark(...h);
    branch(
      [
        base,
        base
          .clone()
          .lerp(hub, 0.52)
          .add(vec(0, 0.025, 0.05)),
        hub,
      ],
      0.039,
      0.02,
      0,
      13,
    );
    for (const [joint, tip, width, sideA, sideB] of clusters) {
      const at = landmark(...joint),
        to = landmark(...tip),
        roll = (random() - 0.53) * 1.14;
      branch(
        [
          hub,
          hub
            .clone()
            .lerp(at, 0.52)
            .add(vec(0, 0.027, 0.015)),
          at,
        ],
        0.019,
        0.008,
        0,
        11,
        7,
      );
      blade(at, to, (width * 1.11) / 102, 0, roll);
      for (const [index, side] of [sideA, sideB].entries()) {
        if (!side) continue;
        const [x, y, z, w] = side,
          end = landmark(x, y, z);
        const sideBase = at.clone().lerp(hub, 0.035 * (1 + index));
        blade(sideBase, end, w / 102, 1, roll + (index === 0 ? 0.44 : -0.41));
      }
    }
  }
  spray(
    stemAt(2.92),
    [246, 191, -0.28],
    [
      [[153, 170, -0.27], [47, 174, -0.08], 22, [119, 141, -0.42, 11], [91, 201, -0.17, 11]],
      [[227, 145, -0.42], [172, 73, -0.18], 25, [181, 124, -0.32, 13], [242, 90, -0.52, 15]],
      [[264, 166, -0.36], [329, 112, -0.34], 21, [259, 137, -0.21, 11], [301, 171, -0.53, 10]],
      [[206, 216, -0.18], [161, 267, 0.06], 22, [174, 208, -0.38, 10], [211, 249, -0.12, 11]],
    ],
  );
  spray(
    stemAt(1.17),
    [232, 316, -0.23],
    [
      [[143, 281, -0.2], [57, 250, -0.05], 22, [103, 281, -0.32, 12], [154, 242, -0.41, 12]],
      [[101, 324, -0.05], [6, 408, 0.18], 25, [47, 342, -0.03, 12], [105, 373, 0.17, 15]],
      [[207, 286, -0.36], [195, 251, -0.35], 12, [190, 278, -0.47, 6], null],
      [[189, 349, -0.54], [118, 384, -0.45], 16, [140, 344, -0.62, 11], null],
    ],
  );
  spray(
    crownAt(2.73),
    [473, 237, -0.27],
    [
      [[551, 244, -0.17], [651, 255, 0.24], 23, [598, 224, -0.23, 13], [578, 275, -0.28, 11]],
      [[562, 276, -0.1], [601, 366, 0.03], 21, [586, 303, -0.13, 12], [551, 315, -0.31, 12]],
      [[518, 212, -0.24], [560, 170, -0.48], 20, [513, 182, -0.39, 12], [540, 217, -0.18, 10]],
      [[466, 217, -0.23], [478, 196, -0.27], 8, null, null],
    ],
  );
  spray(
    crownAt(1.4),
    [417, 390, -0.24],
    [
      [[479, 439, -0.02], [527, 554, 0.17], 29, [449, 483, -0.13, 18], [525, 449, -0.06, 13]],
      [[468, 399, -0.19], [575, 431, 0.03], 22, [506, 370, -0.08, 13], [491, 424, -0.3, 12]],
      [[419, 421, -0.14], [419, 483, 0.01], 13, [403, 435, -0.35, 7], [443, 436, -0.22, 7]],
      [[422, 365, -0.32], [459, 321, -0.23], 14, [424, 338, -0.33, 8], [448, 363, -0.26, 8]],
      [[384, 408, -0.11], [382, 439, -0.15], 9, null, null],
    ],
  );
  spray(
    crownAt(3.49),
    [442, 129, -0.31],
    [
      [[456, 77, -0.3], [459, 12, -0.16], 27, [427, 43, -0.47, 14], [493, 61, -0.33, 13]],
      [[421, 101, -0.43], [358, 67, -0.38], 16, [395, 107, -0.52, 8], null],
      [[410, 137, -0.36], [333, 125, -0.45], 19, [379, 149, -0.48, 9], null],
      [[469, 113, -0.28], [511, 78, -0.36], 15, null, [499, 114, -0.12, 9]],
    ],
  );
  function buildBlades(profiles) {
    const geometry = batch();
    leaves.length = 0;
    const rows = 80,
      cols = 10;
    for (const { at, d, span, across, face, halfWidth, tile, twist, curve, fold, seed } of blades) {
      const outline = [],
        other = [],
        middle = [];
      let previous = [];
      for (let i = 0; i <= rows; i++) {
        const t = i / rows,
          sine = Math.sin(Math.PI * t);
        const profile = profiles?.[tile],
          rowProfile = profile?.[Math.round(t * (profile.length - 1))];
        const naturalWidth = Math.pow(Math.max(0, sine), 0.82) * (0.99 - 0.19 * t);
        const teeth = tile === 0 ? 1 - 0.22 * Math.pow(1 - ((t * 5.3 + 0.26) % 1), 3) : 1;
        const half = 0.49 * naturalWidth * teeth;
        const [left, mid, right, sourceV] = rowProfile || [0.5 - half, 0.5, 0.5 + half, t];
        const rib = at
          .clone()
          .addScaledVector(d, t)
          .addScaledVector(face, span * sine * 0.13)
          .addScaledVector(across, span * (curve * sine + 0.042 * Math.sin(2 * Math.PI * t)));
        rib.y += span * 0.062 * sine;
        const axis = d.clone().normalize(),
          transverse = across.clone().applyAxisAngle(axis, twist * (t - 0.33));
        const normal = new T.Vector3().crossVectors(transverse, axis).normalize();
        if (normal.dot(face) < 0) normal.negate();
        const row = [];
        for (let j = 0; j <= cols; j++) {
          const side = (j / cols) * 2 - 1,
            sourceU = side < 0 ? mid + (mid - left) * side : mid + (right - mid) * side;
          const offset = (sourceU - mid) * 2 * halfWidth;
          const v = rib
            .clone()
            .addScaledVector(
              transverse,
              offset + halfWidth * (mid - 0.5) * 1.4 * T.MathUtils.smoothstep(t, 0, 0.16),
            )
            .addScaledVector(
              normal,
              -halfWidth *
                fold *
                (Math.abs(side) * 0.37 + Math.pow(Math.abs(side), 1.65) * 0.63) *
                naturalWidth +
                halfWidth * 0.045 * side * Math.sin(t * Math.PI * 4 + seed) * sine,
            );
          row.push(geometry.vertex(v, j / cols, t, tile, seed, -1, vec(sourceU, sourceV, 0)));
          if (j === 0) outline.push(v);
          if (j === cols) other.push(v);
          if (j === cols / 2) middle.push(v);
        }
        if (i)
          for (let j = 0; j < cols; j++)
            geometry.quad(previous[j], previous[j + 1], row[j + 1], row[j]);
        previous = row;
      }
      leaves.push({
        tile,
        outline: outline.concat(other.reverse()),
        middle,
        depth: at.clone().addScaledVector(d, 0.5),
      });
    }
    return geometry.finish();
  }

  function fruit(top, r, age) {
    const id = fruits.length,
      lobes = id % 2 ? 6 : 5,
      phi = random() * tau;
    const center = top.clone().add(vec(0, -0.77 * r, 0));
    fruits.push({ top, center, radius: r, age });
    const rings = 28,
      segments = 52;
    let previous = [];
    for (let i = 0; i <= rings; i++) {
      const t = i / rings,
        theta = Math.PI * t,
        s = Math.sin(theta),
        c = Math.cos(theta),
        row = [];
      for (let j = 0; j <= segments; j++) {
        const u = j / segments,
          a = u * tau,
          flute = Math.cos(lobes * a + phi);
        const radius = r * s * (1 + 0.075 * flute * (0.35 + 0.65 * c * c) + 0.045 * c);
        const height =
          0.87 * c -
          0.126 * Math.exp(-theta * theta * 12) * (1 + 0.7 * flute) +
          0.045 * Math.pow(t, 15);
        const local = vec(Math.cos(a) * radius, r * height, Math.sin(a) * radius);
        const tilt = 0.22 + 0.09 * Math.sin(phi),
          oldY = local.y;
        local.y = oldY * Math.cos(tilt) - local.z * Math.sin(tilt);
        local.z = oldY * Math.sin(tilt) + local.z * Math.cos(tilt);
        const p = center.clone().add(local);
        row.push(berries.vertex(p, u, t, 0, age, id, top));
      }
      if (i)
        for (let j = 0; j < segments; j++)
          berries.quad(previous[j], previous[j + 1], row[j + 1], row[j]);
      previous = row;
    }
    // A connected waxy star calyx folds back over the shoulders of each berry.
    for (let l = 0; l < 6; l++) {
      const a = phi + (l * tau) / 6,
        horizontal = vec(Math.cos(a), 0, Math.sin(a)),
        width = vec(-Math.sin(a), 0, Math.cos(a));
      let last = [];
      for (let j = 0; j <= 9; j++) {
        const t = j / 9,
          s = Math.sin(t * Math.PI),
          forward = Math.sin(a),
          // Front sepals drape over the berry. Side sepals first flare, then curl upward.
          arch =
            forward > 0.5
              ? Math.sin(t * 1.19) * 1.02
              : (0.38 * t + 0.37 * t * t + 0.38 * s) * (1 + 0.16 * Math.cos(l)),
          rise =
            forward > 0.5
              ? -0.055 + 0.12 * s - 0.48 * t * t
              : -0.055 + 0.19 * s + t * t * (0.86 + 0.23 * Math.cos(l * 2)),
          m = top.clone().addScaledVector(horizontal, r * arch);
        m.y += r * rise;
        const row = [];
        for (const side of [-1, 0, 1]) {
          const p = m
            .clone()
            .addScaledVector(
              width,
              side * r * (0.004 + 0.128 * Math.sin(Math.PI * Math.pow(t, 0.72))),
            );
          p.y -= Math.abs(side) * s * r * 0.037;
          row.push(berries.vertex(p, (side + 1) / 2, t, 1, age, id, top));
        }
        if (j) for (let k = 0; k < 2; k++) berries.quad(last[k], last[k + 1], row[k + 1], row[k]);
        last = row;
      }
    }
  }
  // The trusses sit forward of the alternating leaves, attached by individual bent pedicels.
  for (const [y, coords, crown] of [
    [
      1.78,
      [
        [-0.78, 0.61, 0.46, 0.5, 0.99],
        [-1.36, 1.2, 0.22, 0.17, 0.47],
      ],
    ],
    [
      1.44,
      [
        [0.58, 0.32, 0.58, 0.38, 0.9],
        [0.38, 1.69, 0.53, 0.235, 0.65],
      ],
      1,
    ],
    [
      3.12,
      [
        [-0.42, 2.1, 0.62, 0.289, 0.84],
        [-0.55, 2.54, 0.3, 0.32, 0.73],
        [0.06, 2.48, 0.46, 0.27, 0.7],
      ],
    ],
    [
      3.8,
      [
        [-0.22, 3.28, 0.42, 0.317, 0.78],
        [0.44, 3.24, 0.5, 0.35, 0.72],
        [0.3, 3.62, 0.17, 0.225, 0.43],
      ],
      1,
    ],
    [3.34, [[1.39, 2.42, 0.39, 0.478, 0.99]], 1],
  ]) {
    const base = (crown ? crownAt : stemAt)(y);
    const last = coords[coords.length > 1 ? 1 : 0];
    const end = vec(last[0] * 0.88, last[1] + last[3] * 0.8 + 0.28, last[2] * 0.8);
    const truss = branch(
      [
        base,
        base
          .clone()
          .lerp(end, 0.48)
          .add(vec(0, 0.16, 0.06)),
        end,
      ],
      0.043,
      0.017,
      0,
      18,
    );
    coords.forEach(([x, h, z, r, age], i) => {
      const at = truss.getPointAt(coords.length === 1 ? 0.92 : [0.42, 0.94, 0.67][i]);
      const top = vec(x, h + 0.77 * r + 0.064 * z, z);
      branch(
        [
          at,
          at
            .clone()
            .lerp(top, 0.52)
            .add(vec(0.05, 0.1, 0.04)),
          top,
        ],
        0.023,
        0.017,
        0,
        8,
        6,
      );
      fruit(top, r, age);
    });
  }
  function flower(at, scale, tilt) {
    // Tomato flowers have five reflexed yellow petals and a prominent fused anther cone.
    for (let i = 0; i < 5; i++) {
      const a = (tau * i) / 5 + tilt,
        axis = vec(Math.cos(a), Math.sin(a), -0.13),
        side = vec(-Math.sin(a), Math.cos(a), 0);
      const c = at.clone(),
        mid = c.clone().addScaledVector(axis, scale * 0.48),
        tip = c.clone().addScaledVector(axis, scale);
      mid.z += scale * 0.15;
      tip.z -= scale * 0.19;
      const ids = [
        c,
        mid.clone().addScaledVector(side, -scale * 0.18),
        tip,
        mid.clone().addScaledVector(side, scale * 0.18),
      ].map((v) => flowers.vertex(v, 0, 0, 2));
      flowers.quad(...ids);
    }
    tube(
      flowers,
      [at, at.clone().add(vec(0.02, -0.025, scale * 0.55))],
      scale * 0.13,
      scale * 0.065,
      3,
      4,
      7,
    );
    parts.push({ points: [at], r: scale, kind: 3 });
  }
  const flowerBase = crownAt(3.72),
    flowerEnds = [
      [0.69, 3.93, -0.15],
      [0.9, 4.05, -0.18],
      [0.96, 3.91, -0.15],
    ];
  const flowering = branch(
    [flowerBase, vec(0.9, 3.89, -0.14), vec(0.79, 3.96, -0.15)],
    0.026,
    0.014,
  );
  flowerEnds.forEach(([x, y, z], i) => {
    const tip = vec(x, y, z);
    branch([flowering.getPointAt(0.26 + i * 0.19), tip], 0.016, 0.009, 0, 6, 5);
    flower(tip, 0.092 + (i % 2) * 0.012, i * 0.73);
  });
  for (let i = 0; i < 22; i++) {
    const a = (tau * i) / 22 + random() * 0.15,
      l = 0.31 + random() * 0.67;
    const base = stemAt(-0.035),
      end = vec(Math.cos(a) * l, -0.41 + random() * 0.06, Math.sin(a) * l);
    const root = branch(
      [
        base,
        vec(end.x * 0.29, -0.18 - random() * 0.05, end.z * 0.33),
        vec(end.x * 0.72, -0.23 - random() * 0.1, end.z * 0.74),
        end,
      ],
      0.029,
      0.002,
      1,
      12,
      5,
    );
    for (let j = 0; j < 3; j++) {
      const k = 0.28 + j * 0.21,
        join = root.getPointAt(k),
        side = join
          .clone()
          .add(
            vec(
              Math.sin(a) * (0.08 + random() * 0.1),
              -0.09,
              -Math.cos(a) * (0.09 + random() * 0.1),
            ),
          );
      branch(
        [join, side, side.clone().add(vec(end.x * 0.12, -0.032, end.z * 0.12))],
        0.008,
        0.001,
        1,
        5,
        4,
      );
    }
  }
  return {
    stem: stems.finish(),
    leaf: buildBlades(),
    buildBlades,
    fruit: berries.finish(),
    flower: flowers.finish(),
    parts,
    leaves,
    fruits,
  };
}
