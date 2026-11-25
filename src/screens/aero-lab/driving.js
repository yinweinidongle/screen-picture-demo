/* SPDX-License-Identifier: MIT */
import { RoadRadar, laneWidth, trafficX } from './radar.js';
import { solvePath, curveValue } from './planner.js';
export { laneWidth, radarRange } from './radar.js';
const clamp = (x, low, high) => Math.max(low, Math.min(high, x));
const smoother = (t) => t * t * t * (10 + t * (-15 + 6 * t));

// Lane number, initial longitudinal position (m), traffic speed (km/h).
const traffic = {
  pass: [
    [0, 56, 36],
    [1, 12, 87],
    [-1, 89, 78],
    [0, 127, 80],
    [1, 103, 58],
  ],
  follow: [
    [0, 37, 38],
    [-1, 8, 44],
    [1, 6, 42],
    [-1, 31, 36],
    [1, 34, 37],
  ],
};

export class DriveSimulation {
  constructor() {
    this.targetKmh = 260;
    this.scenario = 'pass';
    this.radar = new RoadRadar();
    this.seed = 0x94a027;
    this.reset('studio');
  }
  reset(mode) {
    this.mode = mode;
    this.time = this.distance = this.x = this.heading = this.acceleration = 0;
    this.speed = mode === 'pilot' ? 68 / 3.6 : 0;
    this.lane = 0;
    this.trajectory = null;
    this.curvature = 0;
    this.untilPlan = 0;
    this.radar.reset();
    this.paused = false;
    this.untilScan = 0;
    this.targetCount = 0;
    this.history = new Float32Array(65);
    this.historyIndex = 0;
    this.historyCount = 1;
    this.nextSample = 0.16;
    this.nearest = Infinity;
    this.decision = mode === 'pilot' ? '车道保持' : '起步加速';
    this.cars = [];
    if (mode === 'pilot') {
      let layout = traffic[this.scenario];
      if (this.scenario === 'mixed') {
        const random = () => {
          this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
          return this.seed / 4294967296;
        };
        const side = random() < 0.5 ? -1 : 1;
        layout = [
          [0, 45 + random() * 17, 36 + random() * 17],
          [side, 13 + random() * 8, 73 + random() * 13],
          [-side, 47 + random() * 14, 68 + random() * 14],
          [-side, -19 - random() * 9, 76 + random() * 12],
          [side, 90 + random() * 14, 52 + random() * 12],
        ];
      }
      this.cars = layout.map(([lane, z, kmh], id) => ({
        id,
        lane,
        x: lane * laneWidth,
        z,
        speed: kmh / 3.6,
        initialSpeed: kmh / 3.6,
        detected: false,
        heading: 0,
      }));
      this.scan();
      this.plan();
      this.untilScan = 0.1;
      this.untilPlan = 0.2;
      this.radar.advance(this);
    }
  }
  scan() {
    this.radar.observe(this);
  }
  lead(lane) {
    let closest = null;
    for (const car of this.cars)
      if (
        car.detected &&
        Math.abs(trafficX(car) - lane * laneWidth) < 1.8 &&
        car.z >= 0 &&
        (!closest || car.z < closest.z)
      )
        closest = car;
    return closest;
  }
  plan() {
    this.trajectory = solvePath(this);
    const target = this.trajectory.dest;
    this.decision = this.trajectory.emergency
      ? this.trajectory.acceleration < 0
        ? '紧急减速'
        : this.trajectory.acceleration > 0
          ? '加速避让'
          : '保持车速'
      : target !== this.lane
        ? target < this.lane
          ? '向右变道'
          : '向左变道'
        : this.trajectory.limited
          ? '减速跟车'
          : '车道保持';
  }
  pathX(ahead) {
    return this.trajectory ? curveValue(this.trajectory.curve, this.distance + ahead) : this.x;
  }
  get pathLength() {
    let limit = Math.min(63, this.trajectory?.travel ?? 63);
    for (const car of this.cars) {
      const tr = car.track;
      if (!tr || this.time - tr.time > 1) continue;
      const age = this.time - tr.time,
        z = tr.s + tr.vz * age - this.distance;
      if (z >= 1.5 && z < limit + 6 && Math.abs(this.pathX(z) - tr.x - tr.vx * age) < 2.06)
        limit = Math.min(limit, z - 6);
    }
    return Math.max(1.6, limit);
  }
  moveTraffic(dt, delta) {
    // Traffic drivers also follow the vehicle ahead, including the ego after a
    // merge. Compute every speed from the same snapshot before moving anyone.
    for (const car of this.cars) {
      let target =
        car.initialSpeed +
        (this.scenario === 'mixed' ? 2.1 * Math.sin(this.time * 0.31 + car.id * 1.7) : 0);
      const follow = (x, z, speed) => {
        const gap = z - car.z;
        if (gap > 0 && Math.abs(trafficX(car) - x) < 2.02)
          target = Math.min(target, Math.max(0, speed + (gap - 7.1 - car.speed * 0.8) * 0.64));
      };
      follow(this.x, 0, this.speed);
      for (const other of this.cars)
        if (other !== car) follow(trafficX(other), other.z, other.speed);
      car.nextSpeed = Math.max(0, car.speed + clamp((target - car.speed) * 1.45, -6.8, 1.65) * dt);
    }
    for (const car of this.cars) {
      car.speed = car.nextSpeed;
      if (this.scenario === 'mixed') {
        if (car.id === 2 && !car.merge && this.time > 2.4 && car.lane !== 0 && car.z > 10) {
          const clear = (x, z, speed) =>
            Math.abs(x) > 2.1 ||
            [0, 1.8, 3.6].every((t) => Math.abs(z - car.z + (speed - car.speed) * t) > 13);
          const free =
            clear(this.x, 0, this.speed) &&
            this.cars.every(
              (other) => other === car || clear(trafficX(other), other.z, other.speed),
            );
          if (free) car.merge = { from: car.x, start: this.time };
        }
        if (car.merge) {
          const t = clamp((this.time - car.merge.start) / 3.6, 0, 1),
            prev = car.x;
          car.x = car.merge.from * (1 - smoother(t));
          car.heading = Math.atan2(car.x - prev, Math.max(0.0001, car.speed * dt));
          if (t === 1) {
            car.lane = 0;
            car.merge = null;
            car.heading = 0;
          }
        }
      }
      car.z += car.speed * dt - delta;
      if (car.z < -36) {
        car.z += 160 + car.id * 7;
        car.track = null;
        car.detected = false;
      }
    }
  }
  step(dt) {
    this.time += dt;
    let acceleration;
    if (this.mode === 'tunnel') {
      acceleration = clamp((this.targetKmh / 3.6 - this.speed) * 0.83, -14, 21);
      this.decision =
        this.distance < 28 ? '起步加速' : Math.abs(acceleration) > 0.65 ? '隧道穿梭' : '高速巡航';
    } else if (this.mode === 'pilot') {
      acceleration = this.trajectory.acceleration;
    } else return;
    const oldSpeed = this.speed;
    this.speed = Math.max(0, this.speed + acceleration * dt);
    const delta = (oldSpeed + this.speed) * 0.5 * dt;
    this.acceleration = acceleration;
    this.distance += delta;
    if (this.time >= this.nextSample) {
      this.nextSample += 0.16;
      this.historyIndex = (this.historyIndex + 1) % this.history.length;
      this.history[this.historyIndex] = this.speed * 3.6;
      this.historyCount = Math.min(this.history.length, this.historyCount + 1);
    }
    if (this.mode !== 'pilot') return;
    this.moveTraffic(dt, delta);
    const curve = this.trajectory.curve;
    this.x = curveValue(curve, this.distance);
    this.heading = Math.atan(curveValue(curve, this.distance, 1));
    this.curvature = curveValue(curve, this.distance, 2);
    if (this.distance >= curve.start + curve.length) this.lane = curve.dest;
    this.untilScan -= dt;
    this.untilPlan -= dt;
    if (this.untilScan <= 1e-8) {
      this.scan();
      this.untilScan += 0.1;
    }
    if (this.untilPlan <= 1e-8) {
      this.plan();
      this.untilPlan += 0.2;
    }
    this.radar.advance(this);
  }
  advance(seconds) {
    // The same integration is used by playback and manually stepped frames.
    for (let left = seconds; left > 1e-7; left -= 1 / 60) this.step(Math.min(left, 1 / 60));
  }
}
