import * as T from 'three';

// Coordinates are metres in Three.js space. Tracking positions and targets
// use a Z offset from the nose. The train keeps the same screen direction at each cut.
const shots = [
  {
    name: '穹顶俯移',
    duration: 5,
    follow: false,
    lenses: [46, 39],
    positions: [
      [6.2, 14.0, 16],
      [8.2, 12.0, 18.6],
      [9.0, 8.8, 22.2],
      [7.65, 6.15, 26.6],
    ],
    targets: [
      [-4.6, 4.6, -26],
      [-3.3, 4.2, -26],
      [-1.6, 3.5, -23.4],
      [-0.4, 3.0, -18.6],
    ],
  },
  {
    name: '站台低位跟拍',
    duration: 5.75,
    follow: true,
    lenses: [37, 42],
    positions: [
      [4.75, 2.45, 22],
      [4.15, 2.32, 16.8],
      [4.55, 2.65, 9.7],
      [5.65, 3.35, 3.2],
    ],
    targets: [
      [-0.4, 2.5, -5.5],
      [-0.1, 2.46, -5.4],
      [0, 2.53, -4.5],
      [0.25, 2.57, -3.8],
    ],
  },
  {
    name: '沿车窗侧移',
    duration: 3.75,
    follow: true,
    lenses: [39, 42],
    positions: [
      [7.8, 3.35, -4.3],
      [8.65, 3.2, -11.9],
      [7.6, 3.05, -22.6],
      [7.85, 3.7, -36.8],
    ],
    targets: [
      [0.2, 2.78, -15.2],
      [0.2, 2.86, -22.9],
      [0.12, 2.82, -33.9],
      [0.15, 2.95, -48.2],
    ],
  },
  {
    name: '绕车头升起',
    duration: 4.5,
    follow: true,
    lenses: [42.5, 38.4],
    settle: true,
    positions: [
      [5.65, 3.45, 17.7],
      [7.8, 4.65, 15.9],
      [10.5, 5.6, 12.1],
      [13.15, 5.85, 7.0],
    ],
    targets: [
      [-0.45, 3.0, -5.7],
      [-0.55, 3.2, -6.25],
      [-0.4, 3.35, -6.8],
      [-0.35, 3.35, -7.1],
    ],
  },
];
export const FPS = 24;
export const FILM_DURATION = shots.reduce((sum, shot) => sum + shot.duration, 0);
export const STOP_TIME = FILM_DURATION - 1.5;
export const RUN_LENGTH = 112;
const ORIGIN_Z = -76;

export function trainZAt(time) {
  const p = T.MathUtils.clamp(time / STOP_TIME, 0, 1);
  // Integral of a smoothstep brake envelope. Speed and acceleration reach zero together.
  const travelled = 2 * p - 2 * p ** 3 + p ** 4;
  return ORIGIN_Z + RUN_LENGTH * travelled;
}

function path(points) {
  return new T.CatmullRomCurve3(
    points.map(([x, y, z]) => new T.Vector3(x, y, z)),
    false,
    'centripetal',
  );
}
let start = 0;
export const cameraShots = shots.map((shot) => {
  const from = start;
  start += shot.duration;
  return { ...shot, from, to: start, rail: path(shot.positions), gaze: path(shot.targets) };
});
// The scan is cued by the low tracking shot. It clears the last coach halfway
// through the rising wide shot, leaving time to read the completed projection.
export const MATERIAL_START = cameraShots[1].to - 2.5;
export const MATERIAL_END = cameraShots[3].from + cameraShots[3].duration * 0.5;
export function telemetryAt(time) {
  const p = T.MathUtils.clamp(time / STOP_TIME, 0, 1);
  const speed = (RUN_LENGTH / STOP_TIME) * (2 - 6 * p * p + 4 * p * p * p) * 3.6;
  const travelled = trainZAt(time) - ORIGIN_Z;
  const scan = T.MathUtils.clamp((time - MATERIAL_START) / (MATERIAL_END - MATERIAL_START), 0, 1);
  const deceleration = (12 * RUN_LENGTH * p * (1 - p)) / STOP_TIME ** 2;
  return { speed, travelled, remaining: RUN_LENGTH - travelled, scan, deceleration };
}
export function shotAt(time) {
  return cameraShots.find((shot) => time < shot.to) || cameraShots.at(-1);
}
export function poseCamera(camera, time, look) {
  const t = T.MathUtils.clamp(time, 0, FILM_DURATION);
  const shot = shotAt(t);
  const u = (t - shot.from) / shot.duration;
  const eased = T.MathUtils.smootherstep(u, 0, 1);
  const travel = shot.settle ? eased : 0.78 * u + 0.22 * eased;
  shot.rail.getPoint(travel, camera.position);
  shot.gaze.getPoint(travel, look);
  if (shot.follow) {
    const z = trainZAt(t);
    camera.position.z += z;
    look.z += z;
  }
  if (camera.aspect < 0.88) look.x -= 0.7;
  camera.lookAt(look);
  const vfov = T.MathUtils.lerp(shot.lenses[0], shot.lenses[1], eased);
  const aperture = Math.tan(T.MathUtils.degToRad(vfov * 0.5)) * Math.max(1, 1.48 / camera.aspect);
  camera.fov = Math.min(93, T.MathUtils.radToDeg(2 * Math.atan(aperture)));
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return shot;
}
