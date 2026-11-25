/* SPDX-License-Identifier: MIT */
export const laneWidth = 3.55;
export const radarRange = 68;
export const radarBins = 512;
export const beamCount = 64;
const burstPeriod = 0.82;
const displaySpeed = 136; // Slowed for display, in scene metres per second.
const echoFade = 0.15;
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
function intersection(ox, oz, dx, dz, halfX, halfZ) {
  const ix = 1 / (Math.abs(dx) < 1e-8 ? 1e-8 : dx),
    iz = 1 / (Math.abs(dz) < 1e-8 ? 1e-8 : dz);
  const x1 = (-halfX - ox) * ix,
    x2 = (halfX - ox) * ix,
    z1 = (-halfZ - oz) * iz,
    z2 = (halfZ - oz) * iz;
  const enter = Math.max(0, Math.min(x1, x2), Math.min(z1, z2));
  return Math.min(Math.max(x1, x2), Math.max(z1, z2)) >= enter ? enter : Infinity;
}

export class RoadRadar {
  constructor() {
    this.ranges = new Float32Array(radarBins);
    this.owners = new Int16Array(radarBins);
    this.beams = Array.from({ length: beamCount }, () => ({}));
    this.reset();
  }
  reset() {
    for (const beam of this.beams) {
      beam.cycle = -1;
      beam.direction = directions[0];
      beam.length = beam.energy = 0;
    }
  }
  cast(x, cars) {
    for (let i = 0; i < radarBins; i++) {
      const dx = directions[i].x;
      const rail = Math.abs(dx) < 1e-7 ? Infinity : ((dx > 0 ? railX : -railX) - x) / dx;
      this.ranges[i] = Math.min(radarRange, rail);
      this.owners[i] = -1;
    }
    for (let j = 0; j < cars.length; j++) {
      const car = cars[j],
        x0 = x - trafficX(car),
        z0 = -car.z;
      const distance = Math.hypot(x0, z0);
      if (distance > radarRange + 2.4) continue;
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
        const hit = intersection(ox, oz, cos * d.x - sin * d.z, sin * d.x + cos * d.z, 0.94, 2.12);
        if (hit < this.ranges[i]) {
          this.ranges[i] = hit;
          this.owners[i] = j;
        }
      }
    }
  }
  observe(sim) {
    this.cast(sim.x, sim.cars);
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
    this.cast(sim.x, sim.cars);
    const stride = radarBins / beamCount;
    const headingBin = Math.round(((sim.heading || 0) * radarBins) / tau);
    for (let i = 0; i < beamCount; i++) {
      const beam = this.beams[i];
      // Interleave eight bearings around the car per firing. Successive
      // revolutions sample the gaps between the 64 displayed rays.
      const elapsed = sim.time - ((i % 8) * burstPeriod) / 8;
      if (elapsed < 0) continue;
      const cycle = Math.floor(elapsed / burstPeriod);
      const age = elapsed - cycle * burstPeriod;
      if (cycle !== beam.cycle) {
        beam.cycle = cycle;
        beam.bin = (radarBins + i * stride + ((cycle * 3) % stride) + headingBin) % radarBins;
        beam.direction = directions[beam.bin];
        beam.distanceLimit = radarRange;
        beam.hitTime = Infinity;
        beam.vehicleHit = false;
      }
      const range = this.ranges[beam.bin];
      const front = age * displaySpeed;
      if (front >= range && range < radarRange && range <= beam.distanceLimit) {
        beam.distanceLimit = range;
        beam.hitTime = Math.min(age, beam.hitTime);
        beam.vehicleHit = this.owners[beam.bin] >= 0;
      }
      beam.length = Math.min(front, range, beam.distanceLimit);
      const end = Math.min(beam.hitTime, radarRange / displaySpeed);
      const fade = Math.max(0, Math.min(1, (age - end) / echoFade));
      beam.energy = Math.min(1, age / 0.035) * (1 - fade * fade * (3 - 2 * fade));
    }
  }
}
