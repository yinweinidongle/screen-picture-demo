/* SPDX-License-Identifier: MIT */
export const laneWidth = 3.55;
export const radarRange = 68;
export const radarBins = 512;
const bearingsPerWave = 16;
const bearingStride = radarBins / bearingsPerWave;
const wavePeriod = 0.46;
const packets = [
  { delay: 0, length: 1.0, weight: 1 },
  { delay: 0.115, length: 0.7, weight: 0.7 },
];
// Time-stretch propagation so that both ends of each dash can be followed.
const launchSpeed = 38;
const acceleration = 18;
const travel = (t) => t * (launchSpeed + 0.5 * acceleration * t);
const finalSpeed = Math.sqrt(
  launchSpeed ** 2 + 2 * acceleration * (radarRange + packets[0].length),
);
const waveLifetime = (finalSpeed - launchSpeed) / acceleration + packets[1].delay;
const waveSlots = Math.ceil(waveLifetime / wavePeriod);
export const radarSegmentCount = waveSlots * packets.length * bearingsPerWave;
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
    this.waves = Array.from({ length: waveSlots }, () => ({
      packets: packets.map((profile) => ({
        ...profile,
        segments: Array.from({ length: bearingsPerWave }, () => ({})),
      })),
    }));
    this.segments = this.waves.flatMap((wave) => wave.packets.flatMap((packet) => packet.segments));
    this.reset();
  }
  reset() {
    this.lastTime = this.lastX = this.lastStation = this.lastHeading = 0;
    for (const wave of this.waves) wave.serial = -1;
    for (const segment of this.segments) {
      segment.startX = segment.startZ = segment.endX = segment.endZ = segment.energy = 0;
      segment.vehicleHit = false;
    }
  }
  cast(x, cars, zOffset = 0, near = 0, offset = 0, stride = 1) {
    for (let i = offset; i < radarBins; i += stride) {
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
      const first = offset + stride * Math.floor((bearing - span - offset) / stride);
      for (let k = first; k <= Math.ceil(bearing + span) + 1; k += stride) {
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
  launch(sim, wave, packet) {
    const born = wave.born + packet.delay;
    const dt = sim.time - this.lastTime;
    const t = dt > 0 ? Math.max(0, Math.min(1, (born - this.lastTime) / dt)) : 1;
    // Each member of a doublet leaves from the car's pose at its own emission.
    // The road-space origin stays fixed while the vehicle continues to move.
    packet.x = this.lastX + (sim.x - this.lastX) * t;
    packet.station = this.lastStation + (sim.distance - this.lastStation) * t;
    const heading = this.lastHeading + (sim.heading - this.lastHeading) * t;
    const bin = Math.round((heading * radarBins) / tau) + wave.serial * 5;
    packet.offset = ((bin % bearingStride) + bearingStride) % bearingStride;
    const cos = Math.cos(heading),
      sin = Math.sin(heading);
    for (let i = 0; i < packet.segments.length; i++) {
      const s = packet.segments[i],
        dir = directions[packet.offset + i * bearingStride];
      const dx = cos * dir.x - sin * dir.z,
        dz = sin * dir.x + cos * dir.z;
      // Leave a dark clearance around the 5 m display car from the first frame.
      s.launchRadius = Math.min(1.16 / Math.abs(dx), 2.55 / Math.abs(dz)) + 0.3;
      s.stop = radarRange;
      s.vehicleHit = false;
    }
    packet.launched = true;
  }
  propagate(sim, wave, packet) {
    const born = wave.born + packet.delay,
      age = sim.time - born;
    if (age < 0) return;
    if (!packet.launched) this.launch(sim, wave, packet);
    const front = travel(age),
      tail = Math.max(0, front - packet.length);
    if (tail >= radarRange) {
      for (const segment of packet.segments) segment.energy = 0;
      return;
    }
    const z = packet.station - sim.distance;
    // Search from the previous tail. A car which enters the bearing *behind*
    // a detached packet cannot catch it or hide a more distant contact.
    const previousTail = Math.max(0, travel(Math.max(0, this.lastTime - born)) - packet.length);
    this.cast(packet.x, sim.cars, z, previousTail, packet.offset, bearingStride);
    for (let i = 0; i < packet.segments.length; i++) {
      const segment = packet.segments[i],
        bin = packet.offset + i * bearingStride;
      const range = this.ranges[bin],
        direction = directions[bin];
      if (front >= range && range < segment.stop) {
        segment.stop = range;
        segment.vehicleHit = this.owners[bin] >= 0;
      }
      const head = Math.min(front, segment.stop),
        back = Math.min(head, Math.max(segment.launchRadius, tail));
      segment.startX = packet.x + direction.x * back;
      segment.startZ = z + direction.z * back;
      segment.endX = packet.x + direction.x * head;
      segment.endZ = z + direction.z * head;
      segment.energy =
        packet.weight * Math.min(1, (head - back) / 0.38) * Math.min(1, (radarRange - back) / 8);
    }
  }
  advance(sim) {
    const latest = Math.floor((sim.time + 1e-9) / wavePeriod);
    for (let n = Math.max(0, latest - waveSlots + 1); n <= latest; n++) {
      const wave = this.waves[n % waveSlots];
      if (wave.serial !== n) {
        wave.serial = n;
        wave.born = n * wavePeriod;
        for (const packet of wave.packets) {
          packet.launched = false;
          for (const s of packet.segments) s.energy = 0;
        }
      }
      for (const packet of wave.packets) this.propagate(sim, wave, packet);
    }
    this.lastTime = sim.time;
    this.lastX = sim.x;
    this.lastStation = sim.distance;
    this.lastHeading = sim.heading;
  }
}
