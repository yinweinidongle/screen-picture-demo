import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as T from 'three';
import { DriveSimulation, laneWidth, radarRange } from '../src/screens/aero-lab/driving.js';
import { RoadRadar, radarBins } from '../src/screens/aero-lab/radar.js';
import { curveValue } from '../src/screens/aero-lab/planner.js';
import { rollingWheels } from '../src/screens/aero-lab/wheels.js';

test('all four Aventador tyres spin on a lateral axle and stay in contact with the ground', () => {
  const raw = readFileSync(new URL('../assets/models/aero-aventador.glb', import.meta.url));
  const jsonEnd = 20 + raw.readUInt32LE(12);
  const gltf = JSON.parse(raw.toString('utf8', 20, jsonEnd));
  const group = new T.Group();
  const wheels = gltf.nodes
    .filter((n) => n.extras?.aeroAxle)
    .map((n) => {
      const primitive = gltf.meshes[n.mesh].primitives[0];
      const pos = gltf.accessors[primitive.attributes.POSITION];
      const view = gltf.bufferViews[pos.bufferView];
      const start = jsonEnd + 8 + (view.byteOffset ?? 0) + (pos.byteOffset ?? 0);
      const xyz = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++)
        for (let j = 0; j < 3; j++)
          xyz[i * 3 + j] = raw.readFloatLE(start + i * (view.byteStride ?? 12) + j * 4);
      const geometry = new T.BufferGeometry().setAttribute(
        'position',
        new T.BufferAttribute(xyz, 3),
      );
      const mesh = new T.Mesh(geometry);
      mesh.position.fromArray(n.translation);
      mesh.userData = n.extras;
      group.add(mesh);
      return mesh;
    });
  assert.deepEqual(wheels.map((w) => w.userData.aeroAxle).sort(), ['FL', 'FR', 'RL', 'RR']);
  group.position.y = 0.006 - 0.000403535;
  group.updateMatrixWorld(true);
  const centers = [],
    roll = rollingWheels(group, wheels, centers);
  const point = new T.Vector3(),
    xAxis = new T.Vector3(1, 0, 0),
    box = new T.Box3();
  for (const distance of [0, 0.19, 0.67, 1.87, 39.3, 210.4]) {
    roll(distance);
    wheels.forEach((wheel, i) => {
      assert.ok(wheel.getWorldPosition(point).distanceTo(centers[i]) < 0.000001);
      assert.ok(point.copy(xAxis).applyQuaternion(wheel.quaternion).distanceTo(xAxis) < 0.000001);
      box.setFromObject(wheel, true);
      assert.ok(Math.abs(box.min.y - 0.006) < 0.004, `tyre height ${box.min.y}`);
    });
  }
});

test('360° sensing covers the rear and returns the first vehicle surface on each bearing', () => {
  const sim = new DriveSimulation();
  sim.reset('pilot');
  sim.cars = [
    [0, 24],
    [0, 45],
    [1, -8],
    [-1, -20],
    [0, -radarRange - 3],
  ].map(([lane, z]) => ({ lane, z }));
  sim.scan();
  assert.deepEqual(
    sim.cars.map((car) => car.detected),
    [true, false, true, true, false],
  );
  assert.ok(Math.abs(sim.cars[0].range - 21.88) < 0.01);
  assert.equal(sim.nearest, sim.cars[2].range);
  assert.ok(sim.nearest < 8);
});

test('each wave stays at its emission point and only the sectors that hit a surface disappear', () => {
  const radar = new RoadRadar();
  const sim = { x: 0, distance: 0, time: 0, cars: [{ x: 0, z: 15, heading: 0 }] };
  radar.advance(sim);
  const first = radar.pulses[0],
    side = radarBins / 4,
    rear = radarBins / 2;
  assert.ok(Math.abs(first.visibleTo[0] - 12.88) < 0.01);
  for (let i = 1; i <= 24; i++) {
    sim.time = i / 60;
    sim.distance = i * 0.09;
    sim.x = 0.3;
    sim.cars[0].z = 15 - sim.distance;
    radar.advance(sim);
  }
  assert.deepEqual([first.x, first.s], [0, 0]);
  for (const angle of [0, radarBins - 1]) assert.ok(Math.abs(first.cut[angle] - 12.88) < 0.03);
  assert.ok(Math.abs(first.cut[side] - 6.29) < 0.01);
  assert.ok(Math.abs(first.cut[3 * side] - 6.29) < 0.01);
  assert.equal(first.cut[rear], radarRange);
  sim.cars = [{ x: 0, z: -5 - sim.distance }]; // Moves into the rear beam after this wave has passed.
  for (let i = 25; i <= 55; i++) {
    sim.time = i / 60;
    radar.advance(sim);
  }
  assert.ok(first.visibleTo[0] < 13 && first.radius > 30);
  assert.equal(first.visibleTo[rear], radarRange);
  const next = radar.pulses[1];
  assert.deepEqual([next.x, next.s], [sim.x, sim.distance]);
  assert.equal(next.visibleTo[0], radarRange);
  assert.ok(next.visibleTo[rear] < 7);
  assert.ok(next.radius < 5);
});

test('an overtaking path joins the open lane smoothly and agrees with subsequent wheel positions', () => {
  const sim = new DriveSimulation();
  sim.reset('pilot');
  sim.advance(1.2);
  assert.equal(sim.decision, '向右变道');
  assert.equal(sim.trajectory.dest, -1);
  assert.equal(sim.pathX(sim.pathLength), -laneWidth);
  const startDistance = sim.distance;
  const offsets = Array.from({ length: 4 }, (_, i) => sim.pathX(i * 5));
  for (let i = 0; i < offsets.length; i++) {
    while (sim.distance < startDistance + i * 5) sim.advance(1 / 120);
    assert.ok(Math.abs(sim.x - offsets[i]) < 0.025);
  }
  sim.advance(4);
  assert.equal(sim.lane, -1);
  assert.equal(sim.heading, 0);
});

test('mirroring the traffic mirrors the route and newly observed traffic changes the active solution', () => {
  const a = new DriveSimulation(),
    b = new DriveSimulation();
  a.reset('pilot');
  b.reset('pilot');
  for (const c of b.cars) {
    c.x = -c.x;
    c.lane = -c.lane;
    c.track = null;
  }
  b.trajectory = null;
  b.scan();
  b.plan();
  assert.equal(b.trajectory.dest, -a.trajectory.dest);
  for (const z of [0, 5, 15, 30, 60]) assert.ok(Math.abs(a.pathX(z) + b.pathX(z)) < 1e-6);
  a.advance(0.45);
  const old = a.trajectory.curve;
  a.cars.push({ lane: -1, x: -laneWidth, z: 17, speed: 7 });
  a.scan();
  a.plan();
  assert.notEqual(a.trajectory.dest, old.dest);
  assert.ok(a.trajectory.feasible > 0 && a.trajectory.feasible < a.trajectory.tried);
  for (const derivative of [0, 1, 2])
    assert.ok(
      Math.abs(
        curveValue(old, a.distance, derivative) -
          curveValue(a.trajectory.curve, a.distance, derivative),
      ) < 1e-8,
    );
});

test('mixed traffic layouts yield both directions and preserve vehicle clearance during execution', () => {
  const sim = new DriveSimulation(),
    choices = new Set();
  sim.scenario = 'mixed';
  let merge = false;
  for (let run = 0; run < 12; run++) {
    sim.reset('pilot');
    choices.add(sim.trajectory.dest);
    for (let i = 0; i < 3600; i++) {
      sim.step(1 / 60);
      for (const car of sim.cars) {
        if (car.merge) merge = true;
        if (Math.abs(car.x - sim.x) < 2.04)
          assert.ok(Math.abs(car.z) > 4.65, 'overlapping vehicles');
      }
    }
  }
  assert.ok(merge && choices.has(-1) && choices.has(1));
});

test('the planner brakes and shortens the displayed path if all nominal trajectories conflict', () => {
  const sim = new DriveSimulation();
  sim.reset('pilot');
  sim.cars = [-1, 0, 1].map((lane) => ({ lane, z: 8, speed: 0 }));
  sim.scan();
  sim.plan();
  assert.equal(sim.trajectory.feasible, 0);
  assert.equal(sim.decision, '紧急减速');
  assert.ok(sim.trajectory.acceleration < 0 && sim.pathLength < 3);
});

test('a blocked adjacent lane keeps the route behind the lead vehicle while speed settles', () => {
  const sim = new DriveSimulation();
  sim.scenario = 'follow';
  sim.reset('pilot');
  for (let i = 0; i < 40; i++) {
    sim.advance(0.25);
    assert.equal(sim.decision, '减速跟车');
    assert.equal(sim.pathX(sim.pathLength), 0);
    assert.ok(sim.pathLength <= sim.lead(0).z - 5.99);
  }
  assert.ok(Math.abs(sim.speed * 3.6 - 38) < 2);
  assert.ok(sim.lead(0).z > 10);
});

test('tunnel speed, distance and telemetry reproduce across playback and manual steps', () => {
  const a = new DriveSimulation(),
    b = new DriveSimulation();
  a.targetKmh = b.targetKmh = 240;
  a.reset('tunnel');
  b.reset('tunnel');
  for (let i = 0; i < 16; i++) a.advance(0.75);
  for (let i = 0; i < 720; i++) b.advance(1 / 60);
  assert.ok(Math.abs(a.distance - b.distance) < 1e-7);
  assert.ok(Math.abs(a.speed * 3.6 - 240) < 0.2);
  assert.equal(a.decision, '高速巡航');
  assert.equal(a.historyCount, a.history.length);
  a.reset('studio');
  assert.equal(a.distance, 0);
  assert.equal(a.cars.length, 0);
});
