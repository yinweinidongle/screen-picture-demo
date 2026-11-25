/* SPDX-License-Identifier: MIT */
export const laneWidth = 3.55;
export const radarRange = 68;
const cruise = 88 / 3.6;
const laneChangeTime = 2.35;
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
    this.reset('studio');
  }
  reset(mode) {
    this.mode = mode;
    this.time = this.distance = this.x = this.heading = this.acceleration = 0;
    this.speed = mode === 'pilot' ? 68 / 3.6 : 0;
    this.lane = 0;
    this.change = null;
    this.paused = false;
    this.untilScan = 0;
    this.targetCount = 0;
    this.history = new Float32Array(65);
    this.historyIndex = 0;
    this.historyCount = 1;
    this.nextSample = 0.16;
    this.nearest = Infinity;
    this.decision = mode === 'pilot' ? '车道保持' : '起步加速';
    this.cars =
      mode === 'pilot'
        ? traffic[this.scenario].map(([lane, z, kmh], id) => ({
            id,
            lane,
            z,
            speed: kmh / 3.6,
            detected: false,
            range: 0,
          }))
        : [];
    if (mode === 'pilot') {
      this.scan();
      this.plan();
    }
  }
  scan() {
    this.targetCount = 0;
    this.nearest = Infinity;
    for (const car of this.cars) {
      const dx = car.lane * laneWidth - this.x;
      const bearing = Math.atan2(dx, car.z) - this.heading;
      car.range = Math.hypot(dx, car.z);
      const forward = car.range <= radarRange && Math.abs(bearing) <= 0.96;
      const flank = Math.abs(dx) < 6.8 && car.z > -18 && car.z < 9;
      car.detected = forward || flank;
      if (car.detected) {
        this.targetCount++;
        if (car.z > 0) this.nearest = Math.min(this.nearest, car.range);
      }
    }
  }
  lead(lane) {
    let closest = null;
    for (const car of this.cars)
      if (car.detected && car.lane === lane && car.z >= 0 && (!closest || car.z < closest.z))
        closest = car;
    return closest;
  }
  clearLane(lane) {
    return this.cars.every((car) => {
      if (!car.detected || car.lane !== lane) return true;
      const predicted = car.z + (car.speed - this.speed) * laneChangeTime;
      return (
        Math.min(car.z, predicted) > 14 + this.speed * 0.42 || Math.max(car.z, predicted) < -10
      );
    });
  }
  plan() {
    const lead = this.lead(this.lane);
    if (
      !this.change &&
      lead &&
      lead.z < Math.max(37, this.speed * 2.25) &&
      lead.speed < this.speed - 1.2
    ) {
      for (const dest of [this.lane - 1, this.lane + 1]) {
        if (Math.abs(dest) > 1 || !this.clearLane(dest)) continue;
        this.change = {
          from: this.x,
          dest,
          start: this.distance,
          length: Math.max(29, this.speed * laneChangeTime),
        };
        break;
      }
    }
    if (this.change) {
      // The car faces +Z, so its right-hand side is negative world X.
      this.decision = this.change.dest < this.lane ? '向右变道' : '向左变道';
    } else this.decision = lead && lead.z < 47 && lead.speed < cruise ? '减速跟车' : '车道保持';
  }
  pathX(ahead) {
    if (!this.change) return this.lane * laneWidth;
    const { from, dest, start, length } = this.change;
    return (
      from +
      (dest * laneWidth - from) * smoother(clamp((this.distance + ahead - start) / length, 0, 1))
    );
  }
  get pathLength() {
    let horizon = 63;
    for (const car of this.cars) {
      if (!car.detected || car.z < 1.5 || car.z > horizon + 6) continue;
      if (Math.abs(this.pathX(car.z) - car.lane * laneWidth) < 1.9)
        horizon = Math.min(horizon, Math.max(1.6, car.z - 6));
    }
    return horizon;
  }
  step(dt) {
    this.time += dt;
    let acceleration;
    if (this.mode === 'tunnel') {
      acceleration = clamp((this.targetKmh / 3.6 - this.speed) * 0.83, -14, 21);
      this.decision =
        this.distance < 28 ? '起步加速' : Math.abs(acceleration) > 0.65 ? '隧道穿梭' : '高速巡航';
    } else if (this.mode === 'pilot') {
      this.untilScan -= dt;
      if (this.untilScan <= 0) {
        this.scan();
        this.plan();
        this.untilScan += 0.1;
      }
      let target = cruise;
      // During a manoeuvre, protect the occupied lane until the body clears it.
      for (let lane = -1; lane <= 1; lane++) {
        if (Math.abs(this.x - lane * laneWidth) > 2.35 && this.change?.dest !== lane) continue;
        const lead = this.lead(lane);
        if (lead)
          target = Math.min(
            target,
            Math.max(0, lead.speed + (lead.z - 7 - this.speed * 0.82) * 0.54),
          );
      }
      acceleration = clamp((target - this.speed) * 1.65, -5.6, 2.5);
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
    for (const car of this.cars) {
      car.z += car.speed * dt - delta;
      if (car.z < -28) {
        car.z += 140 + car.id * 6;
        car.detected = false;
      }
    }
    this.x = this.pathX(0);
    this.heading = Math.atan2(this.pathX(0.35) - this.x, 0.35);
    if (this.change && this.distance >= this.change.start + this.change.length) {
      this.lane = this.change.dest;
      this.change = null;
      this.heading = 0;
    }
  }
  advance(seconds) {
    // The same integration is used by playback and manually stepped frames.
    for (let left = seconds; left > 1e-7; left -= 1 / 60) this.step(Math.min(left, 1 / 60));
  }
}
