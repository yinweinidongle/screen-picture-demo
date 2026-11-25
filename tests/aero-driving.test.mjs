import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as T from 'three';
import { DriveSimulation, laneWidth, radarRange } from '../src/screens/aero-lab/driving.js';
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

test('radar detects vehicles in the forward sector and the adjacent blind spot', () => {
  const sim = new DriveSimulation();
  sim.reset('pilot');
  sim.cars = [
    [0, radarRange],
    [0, radarRange + 0.1],
    [1, -8],
    [-1, -20],
  ].map(([lane, z]) => ({ lane, z }));
  sim.scan();
  assert.deepEqual(
    sim.cars.map((car) => car.detected),
    [true, false, true, false],
  );
  assert.equal(sim.nearest, radarRange);
});

test('an overtaking path joins the open lane smoothly and agrees with subsequent wheel positions', () => {
  const sim = new DriveSimulation();
  sim.reset('pilot');
  sim.advance(1.2);
  assert.equal(sim.decision, '向右变道');
  assert.equal(sim.change.dest, -1);
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
