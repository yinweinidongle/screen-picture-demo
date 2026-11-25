/* SPDX-License-Identifier: MIT */
import { laneWidth } from './radar.js';

const cruise = 88 / 3.6,
  dt = 0.2,
  steps = 25;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// A quintic lateral trajectory in road coordinates. Position, slope and
// curvature match the executed trajectory at the splice and the lane at its end.
export function curveValue(c, station, order = 0) {
  if (station >= c.start + c.length) return order === 0 ? c.end : 0;
  const u = clamp((station - c.start) / c.length, 0, 1),
    a = c.coeff;
  if (order === 1)
    return ((((5 * a[5] * u + 4 * a[4]) * u + 3 * a[3]) * u + 2 * a[2]) * u + a[1]) / c.length;
  if (order === 2)
    return (((20 * a[5] * u + 12 * a[4]) * u + 6 * a[3]) * u + 2 * a[2]) / (c.length * c.length);
  return ((((a[5] * u + a[4]) * u + a[3]) * u + a[2]) * u + a[1]) * u + a[0];
}
function lateral(sim, lane, length) {
  const end = lane * laneWidth,
    d = end - sim.x;
  const v = Math.tan(sim.heading) * length,
    a = 0.5 * sim.curvature * length * length;
  return {
    start: sim.distance,
    length,
    end,
    dest: lane,
    coeff: [sim.x, v, a, 10 * d - 6 * v - 3 * a, -15 * d + 8 * v + 3 * a, 6 * d - 3 * v - a],
  };
}
// Continuous separating intervals on a time step. A fast-moving object cannot
// tunnel between the samples of an otherwise collision-free trajectory.
function sweptHit(x0, z0, x1, z1, halfX, halfZ) {
  let lo = 0,
    hi = 1;
  const dx = x1 - x0,
    dz = z1 - z0;
  if (Math.abs(dx) < 1e-7) {
    if (Math.abs(x0) > halfX) return false;
  } else {
    const a = (-halfX - x0) / dx,
      b = (halfX - x0) / dx;
    lo = Math.max(lo, Math.min(a, b));
    hi = Math.min(hi, Math.max(a, b));
  }
  if (Math.abs(dz) < 1e-7) {
    if (Math.abs(z0) > halfZ) return false;
  } else {
    const a = (-halfZ - z0) / dz,
      b = (halfZ - z0) / dz;
    lo = Math.max(lo, Math.min(a, b));
    hi = Math.min(hi, Math.max(a, b));
  }
  return lo <= hi;
}
function rollout(sim, curve, goal, tracks, forcedAcceleration = null) {
  let s = 0,
    x = sim.x,
    v = sim.speed,
    prevA = sim.acceleration,
    cost = 0,
    firstA = 0,
    limited = false;
  for (let i = 0; i < steps; i++) {
    const t = i * dt;
    let desired = goal;
    for (const tr of tracks) {
      const gap = tr.z + tr.vz * t - s;
      if (gap <= 0 || Math.abs(tr.x + tr.vx * t - x) > 2.05) continue;
      desired = Math.min(desired, Math.max(0, tr.vz + (gap - 7.2 - v * 0.84) * 0.56));
    }
    const a = forcedAcceleration ?? clamp((desired - v) * 1.6, -5.8, 2.5);
    if (!i) {
      firstA = a;
      limited = desired < cruise - 1;
    }
    const nextV = Math.max(0, v + a * dt),
      nextS = s + (v + nextV) * dt * 0.5;
    const nextX = curveValue(curve, sim.distance + nextS),
      slope = curveValue(curve, sim.distance + nextS, 1);
    const latA = curveValue(curve, sim.distance + nextS, 2) * nextV * nextV + slope * a;
    if (Math.abs(nextX) > 1.5 * laneWidth - 1.06 || Math.abs(latA) > 5.2) return null;
    for (const tr of tracks) {
      const ox = tr.x + tr.vx * t,
        oz = tr.z + tr.vz * t;
      const lateralGap = nextX - (ox + tr.vx * dt),
        longGap = nextS - (oz + tr.vz * dt);
      // Include the projected corners of a turning ego in the swept footprint.
      const clearance = 2.04 + 2.45 * Math.abs(slope) + 0.1 * Math.abs(tr.vx);
      if (sweptHit(x - ox, s - oz, lateralGap, longGap, clearance, 5.15)) {
        if (forcedAcceleration === null) return null;
        return { curve, dest: curve.dest, safeTime: t, travel: s, acceleration: firstA };
      }
      if (Math.abs(lateralGap) < clearance + 0.65)
        cost += dt * 0.026 * Math.max(0, (longGap < 0 ? 7 + v * 0.86 : 9) - Math.abs(longGap)) ** 2;
    }
    cost += dt * (0.095 * a * a + 0.085 * latA * latA + 0.022 * ((a - prevA) / dt) ** 2);
    prevA = a;
    s = nextS;
    x = nextX;
    v = nextV;
  }
  const switching = curve.dest !== sim.lane;
  cost +=
    (switching ? 4.6 : 0) +
    (sim.trajectory && curve.dest !== sim.trajectory.dest ? 2.2 : 0) -
    s -
    1.3 * v;
  return {
    cost,
    acceleration: firstA,
    limited,
    travel: s,
    curve,
    dest: curve.dest,
    safeTime: steps * dt,
  };
}

export function solvePath(sim) {
  const tracks = [];
  for (const car of sim.cars) {
    const tr = car.track;
    if (!tr || sim.time - tr.time > 1) continue;
    const age = sim.time - tr.time;
    tracks.push({
      x: tr.x + tr.vx * age,
      z: tr.s + tr.vz * age - sim.distance,
      vx: tr.vx,
      vz: tr.vz,
    });
  }
  let best = null,
    tried = 0,
    feasible = 0;
  const rear = tracks.find(
    (tr) => tr.z < 0 && tr.z > -26 && Math.abs(tr.x - sim.x) < 2.1 && tr.vz > sim.speed + 0.6,
  );
  const speeds = [cruise, cruise * 0.8, cruise * 0.57];
  if (rear) speeds.push(Math.min(100 / 3.6, rear.vz + 1));
  const near = clamp(Math.round(sim.x / laneWidth), -1, 1);
  for (let lane = Math.max(-1, near - 1); lane <= Math.min(1, near + 1); lane++) {
    const incumbent = sim.trajectory?.curve;
    const continuing =
      incumbent?.dest === lane && sim.distance < incumbent.start + incumbent.length;
    const straight = Math.abs(lane * laneWidth - sim.x) < 0.015 && Math.abs(sim.heading) < 0.003;
    const durations = continuing || straight ? [2.6] : [2.45, 3.25];
    for (const duration of durations) {
      const curve = continuing ? incumbent : lateral(sim, lane, Math.max(27, sim.speed * duration));
      for (const goal of speeds) {
        tried++;
        const candidate = rollout(sim, curve, goal, tracks);
        if (!candidate) continue;
        feasible++;
        if (goal > cruise) candidate.cost += 0.38 * (goal - cruise) ** 2;
        if (!best || candidate.cost < best.cost) best = candidate;
      }
    }
  }
  if (!best) {
    const hold = lateral(sim, near, Math.max(27, sim.speed * 3));
    // Maximize time to contact when every nominal path conflicts. Braking
    // wins a tie, but a fast rear approach can require clearing its path.
    for (const curve of new Set([sim.trajectory?.curve ?? hold, hold])) {
      for (const a of [-7.5, 0, 2.8]) {
        const escape = rollout(sim, curve, cruise, tracks, a);
        if (escape && (!best || escape.safeTime > best.safeTime)) best = escape;
      }
    }
    best ??= { curve: hold, dest: near, travel: sim.speed ** 2 / 15, acceleration: -7.5 };
    best.emergency = true;
    best.limited = true;
  }
  best.tried = tried;
  best.feasible = feasible;
  return best;
}
