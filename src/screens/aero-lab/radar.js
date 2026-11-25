/* SPDX-License-Identifier: MIT */
export const laneWidth = 3.55;
export const radarRange = 68;
export const radarBins = 512;
export const pulseSpeed = 37;
const pulsePeriod = 0.82;
const railX = 6.29,
  tau = Math.PI * 2;
const directions = Array.from({ length: radarBins }, (_, i) => {
  const a = (i * tau) / radarBins;
  return { x: Math.sin(a), z: Math.cos(a) };
});
export function trafficX(car) {
  return car.x ?? car.lane * laneWidth;
}

// Slab intersection in the target's local frame, in metres from the transmitter.
function intersection(ox, oz, dx, dz, halfX, halfZ, near) {
  const ix = 1 / (Math.abs(dx) < 1e-8 ? 1e-8 : dx),
    iz = 1 / (Math.abs(dz) < 1e-8 ? 1e-8 : dz);
  const x1 = (-halfX - ox) * ix,
    x2 = (halfX - ox) * ix,
    z1 = (-halfZ - oz) * iz,
    z2 = (halfZ - oz) * iz;
  const enter = Math.max(near, Math.min(x1, x2), Math.min(z1, z2));
  return Math.min(Math.max(x1, x2), Math.max(z1, z2)) >= enter ? enter : Infinity;
}

export class RoadRadar {
  constructor() {
    this.ranges = new Float32Array(radarBins);
    this.owners = new Int16Array(radarBins);
    this.pulses = Array.from({ length: 3 }, () => ({
      start: -100,
      x: 0,
      s: 0,
      radius: 0,
      checked: 0,
      cut: new Float32Array(radarBins),
      visibleTo: new Float32Array(radarBins),
    }));
    this.reset();
  }
  reset() {
    for (const p of this.pulses) {
      p.start = -100;
      p.radius = Infinity;
      p.cut.fill(radarRange);
      p.visibleTo.fill(radarRange);
    }
    this.nextPulse = 0;
    this.slot = 0;
    this.nextContact = 0;
    this.version = (this.version ?? 0) + 1;
  }
  cast(x, zOffset, cars, near = 0) {
    for (let i = 0; i < radarBins; i++) {
      const dx = directions[i].x;
      const rail = Math.abs(dx) < 1e-7 ? Infinity : ((dx > 0 ? railX : -railX) - x) / dx;
      this.ranges[i] = rail < near ? radarRange : Math.min(radarRange, rail);
      this.owners[i] = -1;
    }
    for (let j = 0; j < cars.length; j++) {
      const car = cars[j],
        x0 = x - trafficX(car),
        z0 = zOffset - car.z;
      const distance = Math.hypot(x0, z0);
      if (distance > radarRange + 2.4 || distance + 2.4 < near) continue;
      const cos = Math.cos(car.heading || 0),
        sin = Math.sin(car.heading || 0);
      const ox = cos * x0 - sin * z0,
        oz = sin * x0 + cos * z0;
      // Only rays inside the object's bounding circle can hit its footprint.
      const bearing = (Math.atan2(-x0, -z0) * radarBins) / tau;
      const span = distance < 2.34 ? radarBins / 2 : (Math.asin(2.34 / distance) * radarBins) / tau;
      for (let k = Math.floor(bearing - span) - 1; k <= Math.ceil(bearing + span) + 1; k++) {
        const i = ((k % radarBins) + radarBins) % radarBins,
          d = directions[i];
        const hit = intersection(
          ox,
          oz,
          cos * d.x - sin * d.z,
          sin * d.x + cos * d.z,
          0.94,
          2.12,
          near,
        );
        if (hit < this.ranges[i]) {
          this.ranges[i] = hit;
          this.owners[i] = j;
        }
      }
    }
  }
  observe(sim) {
    this.cast(sim.x, 0, sim.cars);
    for (const car of sim.cars) {
      car.detected = false;
      car.range = Infinity;
    }
    for (let i = 0; i < radarBins; i++) {
      const car = sim.cars[this.owners[i]];
      if (car) {
        car.detected = true;
        car.range = Math.min(car.range, this.ranges[i]);
      }
    }
    sim.targetCount = 0;
    sim.nearest = Infinity;
    for (const car of sim.cars) {
      if (!car.detected) continue;
      sim.targetCount++;
      sim.nearest = Math.min(sim.nearest, car.range);
      const x = trafficX(car),
        s = sim.distance + car.z;
      const old = car.track,
        dt = old ? sim.time - old.time : 0;
      // Derive velocity from consecutive returns in the stationary road frame.
      const valid = dt > 0.001 && dt < 1.05;
      const vx = valid ? (x - old.x) / dt : (old?.vx ?? 0);
      const vz = valid ? (s - old.s) / dt : (old?.vz ?? car.speed ?? 0);
      car.track = { x, s, vx, vz, time: sim.time };
    }
  }
  advance(sim) {
    if (sim.time + 1e-8 >= this.nextPulse) {
      const p = this.pulses[this.slot];
      p.x = sim.x;
      p.s = sim.distance;
      p.start = sim.time;
      p.checked = 0;
      p.cut.fill(radarRange);
      this.slot = (this.slot + 1) % this.pulses.length;
      this.nextPulse += pulsePeriod;
      this.nextContact = sim.time;
    }
    const check = sim.time + 1e-8 >= this.nextContact;
    for (const p of this.pulses) {
      p.radius = (sim.time - p.start) * pulseSpeed;
      if (!check || p.radius > radarRange + 1) continue;
      // A car entering the beam behind the advancing wave cannot absorb it.
      this.cast(p.x, p.s - sim.distance, sim.cars, Math.max(0, p.checked - 1.0));
      for (let i = 0; i < radarBins; i++) {
        const hit = this.ranges[i];
        // An absorbed sector stays dark for the rest of this wave's life,
        // even when the obstacle subsequently moves away.
        if (hit <= p.radius + 0.45) p.cut[i] = Math.min(p.cut[i], hit);
        p.visibleTo[i] = Math.min(p.cut[i], hit);
      }
      p.checked = p.radius;
    }
    if (check) {
      this.nextContact = sim.time + 1 / 30;
      this.version++;
    }
  }
}
