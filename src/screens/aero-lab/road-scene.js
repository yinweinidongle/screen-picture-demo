/* SPDX-License-Identifier: MIT */
import * as T from 'three';
import { trafficX } from './radar.js';
import { radarRays } from './radar-rays.js';
import { createWarpField } from './warp.js';

const vert = `varying vec2 vUv;varying vec3 point;
  void main(){vUv=uv;point=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const output = `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`;
function shader(fragment, uniforms = {}, extras = {}) {
  return new T.ShaderMaterial({
    uniforms,
    vertexShader: vert,
    fragmentShader: 'varying vec2 vUv;varying vec3 point;\n' + fragment + '\n' + output + '\n}',
    ...extras,
  });
}

function duskSky() {
  const m = shader(
    `void main(){
    vec3 d=normalize(point);float a=atan(d.z,d.x),h=d.y;
    vec3 sun=normalize(vec3(.58,.12,1.));float s=max(dot(d,sun),0.);
    vec3 sky=mix(vec3(.50,.59,.63),vec3(.042,.12,.235),smoothstep(.0,.64,h));
    sky+=vec3(.89,.32,.11)*pow(s,14.)+vec3(.96,.53,.18)*pow(s,120.);
    sky+=vec3(3.,2.2,1.35)*smoothstep(.99963,.99985,s);
    float farRidge=.018+.015*sin(a*11.)+.012*sin(a*19.+1.)+.005*sin(a*49.);
    float nearRidge=.004+.009*sin(a*6.+2.)+.004*sin(a*38.);
    sky=mix(sky,vec3(.245,.32,.38),1.-smoothstep(farRidge,farRidge+.002,h));
    sky=mix(sky,vec3(.135,.212,.26),1.-smoothstep(nearRidge,nearRidge+.0015,h));
    gl_FragColor=vec4(sky,1.);`,
    {},
    { side: T.BackSide, depthWrite: false },
  );
  const sky = new T.Mesh(new T.SphereGeometry(174, 48, 24), m);
  sky.renderOrder = -3;
  return sky;
}
const pose = new T.Object3D();
function place(batch, index, x, y, z, sx = 1, sy = 1, sz = 1, yaw = 0) {
  pose.rotation.y = yaw;
  pose.position.set(x, y, z);
  pose.scale.set(sx, sy, sz);
  pose.updateMatrix();
  batch.setMatrixAt(index, pose.matrix);
}
function roadside() {
  const group = new T.Group(),
    spacing = 18,
    rows = 12;
  const box = new T.BoxGeometry();
  const steel = new T.MeshStandardMaterial({ color: '#45555d', metalness: 0.62, roughness: 0.43 });
  const rail = new T.InstancedMesh(box, steel, rows * 8);
  const lamps = new T.InstancedMesh(
    box,
    new T.MeshBasicMaterial({ color: new T.Color(2.9, 2.38, 1.72) }),
    rows * 2,
  );
  let j = 0,
    k = 0;
  for (let i = 0; i < rows; i++)
    for (const sign of [-1, 1]) {
      const z = (i - 2) * spacing;
      place(rail, j++, sign * 6.34, 0.54, z, 0.1, 0.2, spacing);
      place(rail, j++, sign * 6.34, 0.27, z, 0.15, 0.56, 0.16);
      place(rail, j++, sign * 7.55, 2.66, z, 0.115, 5.32, 0.13);
      place(rail, j++, sign * 6.84, 5.32, z, 1.55, 0.12, 0.21);
      place(lamps, k++, sign * 6.39, 5.245, z, 0.66, 0.024, 0.25);
    }
  group.add(rail, lamps);
  return group;
}

// A repeating stretch of irregular windbreaks gives the radar a stable horizon.
// Tree height and spacing repeat at the wrap, so stepping a paused drive is seamless.
const grovePeriod = 72;
function roadsideTrees() {
  const profile = [
    [0.033, 0],
    [0.03, 0.2],
    [0.17, 0.16],
    [0.13, 0.24],
    [0.23, 0.21],
    [0.18, 0.3],
    [0.2, 0.28],
    [0.15, 0.38],
    [0.19, 0.34],
    [0.12, 0.46],
    [0.16, 0.41],
    [0.1, 0.54],
    [0.13, 0.49],
    [0.085, 0.63],
    [0.107, 0.58],
    [0.057, 0.73],
    [0.079, 0.68],
    [0.038, 0.83],
    [0.048, 0.79],
    [0.003, 1],
  ];
  const shape = new T.LatheGeometry(
    profile.map(([r, y]) => new T.Vector2(r, y)),
    11,
  );
  const canopy = shape.attributes.position;
  for (let i = 0; i < canopy.count; i++) {
    const x = canopy.getX(i),
      y = canopy.getY(i),
      z = canopy.getZ(i);
    const angle = Math.atan2(x, z);
    const variation = 1 + 0.17 * Math.cos(angle * 5 + y * 37) + 0.11 * Math.sin(angle * 3 - y * 24);
    canopy.setXYZ(
      i,
      x * variation,
      y + 0.018 * Math.sin(angle * 4 + y * 23) * Math.sin(Math.PI * y),
      z * variation,
    );
  }
  shape.computeVertexNormals();
  const trees = new T.InstancedMesh(
    shape,
    new T.MeshStandardMaterial({ color: '#ffffff', roughness: 0.96 }),
    4 * 2 * 28,
  );
  const tint = new T.Color();
  let seed = 0x235f81;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  let index = 0;
  for (const side of [-1, 1]) {
    for (let i = 0; i < 28; i++) {
      const z = random() * grovePeriod,
        x = side * (18 + random() * random() * 30);
      const h = 2.5 + random() * 3.8,
        spread = 0.79 + random() * 0.65;
      tint.setHSL(0.29 + random() * 0.052, 0.11 + random() * 0.13, 0.13 + random() * 0.105);
      for (let repeat = -1; repeat < 3; repeat++) {
        place(trees, index, x, -0.07, z + repeat * grovePeriod, h * spread, h, h * spread);
        trees.setColorAt(index++, tint);
      }
    }
  }
  return trees;
}

// Cast silhouettes vary along the length, including a separate glazed cabin.
function shell(rings, base) {
  const vertices = [],
    faces = [],
    corners = 6;
  for (const [z, w, top] of rings)
    for (const [x, y] of [
      [-w * 0.84, base],
      [-w, base + 0.13],
      [-w * 0.82, top],
      [w * 0.82, top],
      [w, base + 0.13],
      [w * 0.84, base],
    ])
      vertices.push(x, y, z);
  for (let r = 0; r < rings.length - 1; r++)
    for (let j = 0; j < corners; j++) {
      const a = r * corners + j,
        b = r * corners + ((j + 1) % corners);
      faces.push(a, b, a + corners, b, b + corners, a + corners);
    }
  const last = (rings.length - 1) * corners;
  for (let j = 1; j < corners - 1; j++) faces.push(0, j + 1, j, last, last + j, last + j + 1);
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
  g.setIndex(faces);
  g.computeVertexNormals();
  return g;
}
function trafficMeshes() {
  const group = new T.Group(),
    max = 5;
  const material = (color, metalness, roughness) =>
    new T.MeshStandardMaterial({ color, metalness, roughness, side: T.DoubleSide });
  const bodies = new T.InstancedMesh(
    shell(
      [
        [-2.12, 0.83, 0.71],
        [-1.75, 0.94, 0.91],
        [0.95, 0.94, 0.86],
        [2.11, 0.79, 0.64],
      ],
      0.29,
    ),
    material('#ffffff', 0.55, 0.3),
    max,
  );
  const cabins = new T.InstancedMesh(
    shell(
      [
        [-1.48, 0.75, 0.94],
        [-0.68, 0.68, 1.34],
        [0.4, 0.66, 1.32],
        [1.19, 0.74, 0.91],
      ],
      0.8,
    ),
    material('#304856', 0.5, 0.17),
    max,
  );
  const tire = new T.CylinderGeometry(0.32, 0.32, 0.2, 14);
  tire.rotateZ(Math.PI / 2);
  const wheels = new T.InstancedMesh(tire, material('#252b2f', 0.05, 0.73), max * 4);
  const lamps = new T.InstancedMesh(
    new T.BoxGeometry(),
    new T.MeshBasicMaterial({ color: new T.Color(2.0, 0.07, 0.026) }),
    max * 2,
  );
  const shadow = new T.InstancedMesh(
    new T.PlaneGeometry(2.35, 5.0).rotateX(-Math.PI / 2),
    shader(
      `void main(){float a=exp(-3.6*dot(vUv-.5,vUv-.5)*3.);gl_FragColor=vec4(.006,.012,.016,a*.57);`,
      {},
      { transparent: true, depthWrite: false },
    ),
    max,
  );
  const coords = new Float32Array(max * 8 * 3 * 2 * 3),
    colors = new Float32Array(coords.length);
  const box = new T.BufferGeometry();
  box.setAttribute('position', new T.BufferAttribute(coords, 3));
  box.setAttribute('color', new T.BufferAttribute(colors, 3));
  const brackets = new T.LineSegments(
    box,
    new T.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.92 }),
  );
  brackets.frustumCulled = false;
  brackets.renderOrder = 9;
  const palette = ['#977952', '#536e86', '#c8c7b8', '#6f7777', '#797386'].map(
    (c) => new T.Color(c),
  );
  for (let i = 0; i < max; i++) bodies.setColorAt(i, palette[i]);
  group.add(shadow, bodies, cabins, wheels, lamps, brackets);
  const batches = [bodies, cabins, wheels, lamps, shadow];
  for (const batch of batches) {
    batch.frustumCulled = false;
    batch.instanceMatrix.setUsage(T.DynamicDrawUsage);
  }
  return {
    group,
    update(sim) {
      let segments = 0;
      for (const car of sim.cars) {
        const i = car.id,
          x = trafficX(car),
          z = car.z,
          yaw = car.heading || 0,
          cs = Math.cos(yaw),
          sn = Math.sin(yaw);
        const part = (batch, index, dx, y, dz, sx = 1, sy = 1, sz = 1) =>
          place(batch, index, x + cs * dx + sn * dz, y, z - sn * dx + cs * dz, sx, sy, sz, yaw);
        part(bodies, i, 0, 0, 0);
        part(cabins, i, 0, 0, 0);
        part(shadow, i, 0, 0.02, 0);
        for (let wheel = 0; wheel < 4; wheel++)
          part(wheels, i * 4 + wheel, wheel % 2 ? -0.88 : 0.88, 0.32, wheel < 2 ? -1.37 : 1.3);
        for (let side = 0; side < 2; side++)
          part(lamps, i * 2 + side, side ? -0.58 : 0.58, 0.71, -2.132, 0.44, 0.062, 0.034);
        if (!car.detected) continue;
        const warning = Math.abs(x - sim.x) < 2.8 && z > 0 && z < 45;
        for (const sx of [-1, 1])
          for (const sy of [-1, 1])
            for (const sz of [-1, 1]) {
              const px = x + cs * sx * 1.08 + sn * sz * 2.3,
                py = 0.82 + sy * 0.76,
                pz = z - sn * sx * 1.08 + cs * sz * 2.3;
              for (let dim = 0; dim < 3; dim++) {
                const j = segments++ * 6;
                coords[j] = coords[j + 3] = px;
                coords[j + 1] = coords[j + 4] = py;
                coords[j + 2] = coords[j + 5] = pz;
                const dx = dim === 0 ? sx * 0.35 : 0,
                  dz = dim === 2 ? sz * 0.65 : 0;
                coords[j + 3] -= cs * dx + sn * dz;
                coords[j + 4] -= dim === 1 ? sy * 0.34 : 0;
                coords[j + 5] -= cs * dz - sn * dx;
                for (let n = j; n <= j + 3; n += 3) {
                  colors[n] = warning ? 1.8 : 0.2;
                  colors[n + 1] = warning ? 0.69 : 1.12;
                  colors[n + 2] = warning ? 0.18 : 1.42;
                }
              }
            }
      }
      box.setDrawRange(0, segments * 2);
      box.attributes.position.needsUpdate = box.attributes.color.needsUpdate = true;
      for (const batch of batches) batch.instanceMatrix.needsUpdate = true;
    },
  };
}

function guidance() {
  const count = 72,
    verts = new Float32Array((count + 1) * 6),
    uv = [],
    indices = [];
  for (let i = 0; i <= count; i++) {
    uv.push(-1, i / count, 1, i / count);
    const j = i * 2;
    if (i < count) indices.push(j, j + 1, j + 2, j + 1, j + 3, j + 2);
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(verts, 3).setUsage(T.DynamicDrawUsage));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  g.setIndex(indices);

  const path = new T.Mesh(
    g,
    shader(
      `void main(){
        float across=abs(vUv.x), along=vUv.y;
        vec3 nearColor=vec3(.012,.20,1.12), middleColor=vec3(.15,.078,1.07);
        vec3 farColor=vec3(.64,.045,.98);
        vec3 ramp=mix(nearColor,middleColor,smoothstep(.0,.43,along));
        ramp=mix(ramp,farColor,smoothstep(.28,.88,along));
        float aa=clamp(fwidth(vUv.x),.008,.12);
        float feather=1.-smoothstep(.78-aa,1.,across);
        float edge=1.-smoothstep(.012,.031+aa,abs(across-.77));
        float fade=smoothstep(0.,.028,along)*(1.-smoothstep(.88,1.,along));
        gl_FragColor=vec4(ramp*(1.+.36*edge),fade*feather*(.63+.22*edge));`,
      {},
      { side: T.DoubleSide, transparent: true, depthWrite: false, forceSinglePass: true },
    ),
  );
  path.frustumCulled = false;
  path.renderOrder = 7;
  return {
    path,
    update(sim) {
      const horizon = sim.pathLength;
      for (let i = 0; i <= count; i++) {
        const z = 1.5 + (i / count) * (horizon - 1.5),
          x = sim.pathX(z),
          j = i * 6;
        verts[j] = x - 1.07;
        verts[j + 3] = x + 1.07;
        verts[j + 1] = verts[j + 4] = 0.054;
        verts[j + 2] = verts[j + 5] = z;
      }
      g.attributes.position.needsUpdate = true;
    },
  };
}

export function createRoadScene() {
  const root = new T.Group(),
    track = new T.Group(),
    rotated = new T.Group();
  const vault = createWarpField(),
    sky = duskSky(),
    verge = roadside(),
    trees = roadsideTrees(),
    traffic = trafficMeshes(),
    route = guidance(),
    rays = radarRays();
  track.add(verge, trees, traffic.group, route.path, rays.mesh);
  rotated.add(track);
  root.add(vault.mesh, sky, rotated);
  root.visible = false;
  return {
    root,
    emitters: { tunnel: [vault.mesh], pilot: [rays.mesh, route.path] },
    show(mode) {
      root.visible = mode !== 'studio';
      vault.mesh.visible = mode === 'tunnel';
      sky.visible = rotated.visible = mode === 'pilot';
    },
    update(sim) {
      if (sim.mode === 'tunnel') {
        vault.update(sim);
      } else {
        rotated.rotation.y = -sim.heading;
        track.position.x = -sim.x;
        verge.position.z = -(sim.distance % 18);
        trees.position.z = -(sim.distance % grovePeriod);
        traffic.update(sim);
        route.update(sim);
        rays.update(sim);
      }
    },
  };
}
