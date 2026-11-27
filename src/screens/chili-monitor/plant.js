/* SPDX-License-Identifier: MIT */
import * as THREE from 'three';
import { createPlantBloom } from './plant-bloom.js';

const WIDTH = 766;
const HEIGHT = 670;
const PIVOT = [799, 840];

// The front pose uses coordinates from the design. Depth separates the stems, fruit and blades.
const branches = [
  [
    13.5,
    6.5,
    [
      [799, 852, 0],
      [800, 747, 1],
      [802, 667, 0],
      [804, 604, -1],
      [813, 529, 2],
      [816, 469, 3],
      [813, 448, 3],
    ],
  ],
  [
    6.6,
    0.8,
    [
      [813, 451, 3],
      [784, 419, -4],
      [749, 395, -9],
      [706, 352, -12],
      [668, 328, -17],
      [648, 285, -22],
      [657, 246, -24],
    ],
  ],
  [
    3.3,
    0.7,
    [
      [685, 338, -13],
      [651, 318, -10],
      [621, 309, -14],
      [586, 306, -20],
      [554, 318, -23],
    ],
  ],
  [
    2.2,
    0.6,
    [
      [753, 395, -8],
      [775, 382, -15],
      [774, 345, -22],
      [758, 333, -25],
    ],
  ],
  [
    4.7,
    0.7,
    [
      [809, 625, 0],
      [781, 604, -10],
      [749, 595, -17],
      [719, 570, -22],
      [677, 563, -30],
      [628, 559, -35],
      [592, 559, -34],
      [555, 551, -37],
    ],
  ],
  [
    3.4,
    0.5,
    [
      [686, 565, -27],
      [650, 531, -31],
      [628, 506, -37],
      [602, 479, -40],
      [572, 467, -41],
      [541, 468, -44],
    ],
  ],
  [
    2.5,
    0.6,
    [
      [752, 599, -15],
      [719, 600, -20],
      [686, 618, -24],
      [650, 632, -31],
      [621, 646, -33],
    ],
  ],
  [
    3.6,
    0.7,
    [
      [801, 735, 0],
      [769, 698, -5],
      [753, 671, -12],
      [743, 632, -18],
      [731, 610, -21],
    ],
  ],
  [
    6.0,
    0.7,
    [
      [814, 449, 2],
      [846, 413, -4],
      [867, 376, -9],
      [881, 333, -10],
      [881, 294, -15],
      [881, 258, -19],
      [867, 231, -24],
      [850, 218, -25],
    ],
  ],
  [
    2.4,
    0.6,
    [
      [881, 268, -17],
      [903, 245, -26],
      [928, 223, -32],
      [951, 210, -39],
    ],
  ],
  [
    2.8,
    0.5,
    [
      [878, 352, -12],
      [897, 339, -16],
      [928, 338, -21],
      [952, 341, -26],
    ],
  ],
  [
    4.1,
    0.7,
    [
      [815, 458, 4],
      [844, 436, 5],
      [887, 421, 1],
      [928, 416, -3],
      [969, 396, -11],
      [1001, 369, -17],
      [1040, 349, -19],
    ],
  ],
  [
    1.7,
    0.5,
    [
      [968, 397, -13],
      [1002, 393, -18],
      [1027, 390, -19],
      [1056, 399, -27],
    ],
  ],
  [
    4.4,
    0.7,
    [
      [799, 634, 0],
      [816, 585, 5],
      [847, 546, -1],
      [872, 518, -6],
      [904, 506, -17],
    ],
  ],
  [
    4.1,
    0.7,
    [
      [800, 696, 1],
      [834, 671, 5],
      [869, 647, 1],
      [904, 631, -7],
      [939, 607, -14],
      [972, 572, -19],
      [995, 541, -24],
      [1027, 514, -25],
      [1058, 502, -29],
    ],
  ],
  [
    2.1,
    0.5,
    [
      [944, 602, -13],
      [971, 597, -16],
      [1001, 616, -19],
      [1023, 643, -22],
    ],
  ],
  [
    2.0,
    0.5,
    [
      [982, 554, -19],
      [1009, 554, -25],
      [1036, 563, -33],
      [1048, 589, -36],
    ],
  ],
  [
    3.1,
    0.6,
    [
      [801, 752, 2],
      [824, 727, 1],
      [848, 695, -2],
      [872, 672, -5],
      [899, 647, -13],
    ],
  ],
];

// Petiole base, sharp tip, half width, blade sweep, depth, and curl.
const leaves = [
  [651, 263, 508, 208, 23, 12, -20, 1],
  [655, 250, 716, 190, 14, 9, -13, -1],
  [658, 294, 756, 301, 17, 26, -24, 1],
  [652, 304, 586, 297, 10, -14, -30, -1],
  [605, 305, 435, 394, 30, -27, -17, 1],
  [630, 313, 590, 368, 9, 9, -22, -1],
  [620, 311, 554, 356, 15, -15, -31, 1],
  [714, 340, 681, 310, 11, -6, -28, 1],
  [728, 336, 761, 308, 9, 11, -27, -1],
  [765, 356, 807, 342, 9, 9, -38, 1],
  [767, 365, 660, 430, 26, -21, 19, 1],
  [782, 378, 823, 388, 15, 11, -13, -1],
  [748, 429, 729, 400, 6, 7, -17, 1],
  [871, 238, 805, 190, 12, -9, -30, -1],
  [877, 258, 740, 279, 21, -21, -29, 1],
  [901, 245, 881, 181, 10, 11, -17, -1],
  [932, 225, 1040, 185, 17, 5, -16, 1],
  [874, 294, 791, 323, 19, -18, -14, -1],
  [881, 305, 921, 253, 9, 11, -23, 1],
  [878, 314, 927, 300, 12, 11, -37, -1],
  [864, 378, 822, 349, 10, -8, -35, 1],
  [904, 339, 984, 349, 12, 13, -23, 1],
  [869, 373, 946, 398, 17, 17, -18, -1],
  [1002, 371, 1162, 399, 26, 37, -21, 1],
  [1004, 370, 1036, 339, 8, 7, -26, -1],
  [1003, 395, 1088, 427, 17, 14, -19, -1],
  [1007, 401, 1056, 456, 12, 8, -26, 1],
  [948, 412, 973, 379, 7, 4, -13, 1],
  [907, 422, 831, 508, 19, -7, 4, 1],
  [936, 417, 928, 477, 8, -7, -20, -1],
  [612, 483, 435, 495, 19, -22, -12, 1],
  [579, 464, 523, 419, 11, 5, -30, -1],
  [568, 468, 501, 523, 13, 5, -19, 1],
  [627, 484, 602, 460, 7, -5, -25, -1],
  [648, 545, 428, 600, 33, -26, -22, 1],
  [621, 557, 579, 600, 12, 10, -37, -1],
  [657, 544, 634, 468, 12, 8, -20, -1],
  [641, 477, 711, 499, 16, 19, -21, 1],
  [586, 551, 554, 680, 17, -10, -28, -1],
  [649, 627, 600, 734, 22, -11, 13, 1],
  [684, 604, 692, 663, 15, 19, -25, -1],
  [716, 593, 742, 569, 9, 0, -23, 1],
  [890, 513, 925, 578, 15, 9, 1, -1],
  [895, 508, 940, 519, 8, 14, -26, 1],
  [904, 581, 875, 607, 10, 9, -21, 1],
  [874, 646, 906, 589, 10, 12, -33, -1],
  [897, 639, 957, 706, 15, 14, -11, -1],
  [907, 622, 893, 663, 8, 6, -18, 1],
  [956, 596, 980, 602, 6, 7, -25, -1],
  [979, 618, 1075, 738, 28, 16, -13, -1],
  [1001, 550, 1080, 638, 24, 19, -18, -1],
  [1014, 541, 1089, 561, 10, 14, -23, 1],
  [1026, 499, 1152, 560, 23, 22, -13, 1],
  [1017, 511, 1040, 485, 7, 3, -29, -1],
];

// Each row describes a fruit stalk, shoulder, curve and tapered tip.
const fruits = [
  {
    stem: [
      [638, 330, -9],
      [612, 336, -2],
    ],
    points: [
      [608, 365, 12],
      [599, 395, 17],
      [594, 438, 11],
      [608, 462, 6],
    ],
    radius: 16,
  },
  {
    stem: [
      [637, 332, -13],
      [650, 340, -11],
    ],
    points: [
      [647, 364, -3],
      [645, 395, 4],
      [636, 437, 2],
      [624, 456, -3],
    ],
    radius: 13,
  },
  {
    stem: [
      [871, 247, -14],
      [844, 284, 2],
    ],
    points: [
      [845, 319, 10],
      [844, 350, 14],
      [831, 389, 9],
      [827, 421, 3],
    ],
    radius: 13.5,
  },
  {
    stem: [
      [731, 391, 6],
      [724, 409, 20],
    ],
    points: [
      [722, 431, 26],
      [720, 473, 30],
      [700, 518, 21],
      [699, 550, 14],
    ],
    radius: 17,
  },
  {
    stem: [
      [775, 418, -2],
      [760, 412, 11],
      [756, 432, 24],
    ],
    points: [
      [763, 457, 34],
      [762, 501, 42],
      [775, 546, 34],
      [798, 583, 23],
    ],
    radius: 21.5,
  },
  {
    stem: [
      [930, 419, 1],
      [948, 438, 27],
    ],
    points: [
      [955, 461, 41],
      [954, 503, 48],
      [940, 553, 40],
      [925, 614, 23],
    ],
    radius: 22.5,
    ripe: true,
  },
  {
    stem: [
      [994, 386, -13],
      [1003, 412, -6],
    ],
    points: [
      [1003, 446, 6],
      [1004, 486, 16],
      [999, 525, 12],
      [987, 567, 2],
    ],
    radius: 16,
  },
  {
    stem: [
      [867, 515, 0],
      [875, 537, 9],
    ],
    points: [
      [866, 560, 23],
      [858, 602, 28],
      [838, 650, 25],
      [814, 676, 12],
    ],
    radius: 19,
  },
  {
    stem: [
      [687, 600, -24],
      [685, 616, -17],
    ],
    points: [
      [682, 635, -11],
      [676, 662, -6],
      [664, 689, -9],
      [674, 712, -16],
    ],
    radius: 11,
  },
  {
    stem: [
      [719, 597, -10],
      [718, 616, 9],
    ],
    points: [
      [718, 646, 23],
      [714, 693, 30],
      [725, 754, 23],
      [752, 793, 10],
    ],
    radius: 19.5,
  },
  {
    stem: [
      [728, 595, -14],
      [743, 604, -3],
    ],
    points: [
      [753, 621, 5],
      [754, 647, 8],
      [753, 681, 5],
      [763, 705, -2],
    ],
    radius: 9.8,
  },
  {
    stem: [
      [871, 648, -1],
      [875, 668, 10],
    ],
    points: [
      [873, 690, 24],
      [868, 727, 29],
      [853, 770, 23],
      [855, 810, 11],
    ],
    radius: 15,
  },
  {
    stem: [
      [952, 604, -14],
      [968, 621, 1],
    ],
    points: [
      [969, 650, 17],
      [970, 690, 23],
      [958, 736, 18],
      [940, 762, 8],
    ],
    radius: 16.5,
  },
];

const vertexShader = `
  attribute vec3 organ;
  uniform float time;
  varying vec2 vUv;
  varying vec3 vOrgan;
  varying vec3 vNormal;
  varying float vHeight;
  varying vec3 vViewOffset;

  void main() {
    vUv = uv;
    vOrgan = organ;
    vNormal = normalize(normalMatrix * normal);
    vHeight = clamp(position.y / 668.0, 0.0, 1.0);
    vec3 p = position;
    float flex = pow(vHeight, 2.0);
    p.x += 1.35 * sin(time * 0.68 + p.y * 0.006 + p.z * 0.009) * flex;
    p.z += 1.10 * sin(time * 0.54 + p.x * 0.014) * flex;
    vec4 viewPosition = modelViewMatrix * vec4(p, 1.0);
    vViewOffset = viewPosition.xyz - modelViewMatrix[3].xyz;
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const fragmentShader = `
  uniform sampler2D leafScan;
  uniform float scanReady;
  varying vec2 vUv;
  varying vec3 vOrgan;
  varying vec3 vNormal;
  varying float vHeight;
  varying vec3 vViewOffset;

  float line(float p, float halfWidth) {
    float aa = max(fwidth(p), 0.001);
    return 1.0 - smoothstep(halfWidth - aa * 0.33, halfWidth + aa * 0.7, abs(p));
  }

  float gridLine(float p, float halfWidth) {
    float aa = clamp(fwidth(p), 0.001, 0.50);
    float distanceToLine = abs(fract(p + 0.5) - 0.5);
    return 1.0 - smoothstep(halfWidth - aa * 0.24, halfWidth + aa * 0.60, distanceToLine);
  }

  void main() {
    vec2 tex = vUv;
    float blade = step(0.5, vOrgan.x) * (1.0 - step(1.5, vOrgan.x));
    float pod = step(1.5, vOrgan.x) * (1.0 - step(2.5, vOrgan.x));
    float cap = step(2.5, vOrgan.x);
    vec3 n = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
    float side = tex.x * 2.0 - 1.0;
    float spread = abs(side);
    float seed = vOrgan.z;
    float front = smoothstep(-65.0, 52.0, vViewOffset.z);
    float gaze = clamp(abs(n.z), 0.0, 1.0);
    float rim = 1.0 - gaze;
    float margin = smoothstep(0.926, 1.0, spread);
    float edgePixel = clamp(fwidth(spread), 0.014, 0.14);
    float outline = smoothstep(1.0 - 1.35 * edgePixel, 1.0, spread);
    vec3 key = normalize(vec3(-0.61, 0.59, 0.53));
    vec3 back = normalize(vec3(0.39, 0.21, -0.90));
    vec3 halfKey = normalize(key + vec3(0.0, 0.0, 1.0));
    float diffuse = max(dot(n, key), 0.0);
    float facingKey = smoothstep(-0.53, 0.71, dot(n, key));
    float shine = max(dot(n, halfKey), 0.0);
    vec2 fork = (vViewOffset.xy - vec2(12.0, 369.0)) / vec2(99.0, 190.0);
    float junction = exp(-dot(fork, fork));

    float leafAcross = tex.x * (19.0 + seed * 5.0) + sin(tex.y * 15.0) * 0.13;
    float leafAlong = (tex.y - 0.205 * pow(spread, 1.38) * sin(3.14159 * tex.y)) * (35.0 + seed * 13.0);
    float fineLeaf = max(gridLine(leafAcross, 0.027), gridLine(leafAlong, 0.039));
    float mainVein = line(side, 0.014) * (1.0 - 0.3 * tex.y);
    float lateral = gridLine(leafAlong * (0.195 + seed * 0.018), 0.025) * (1.0 - 0.59 * spread);
    float branches = gridLine(leafAlong * 0.39 + side * side * 2.5, 0.025) * 0.35;
    vec2 scanned = texture2D(leafScan, tex).rg;
    float leafVeins = mix(
      fineLeaf * 0.33 + mainVein * 0.65 + lateral * 0.34 + branches,
      pow(scanned.r, 1.2) * 0.56 + smoothstep(0.079, 0.49, scanned.g) * 0.57
        + mainVein * 0.23 + lateral * 0.13 + fineLeaf * 0.24,
      scanReady
    );
    // Thin tissue transmits the backlight chiefly near the glancing, outer part of each blade.
    float throughLeaf = max(dot(-n, back), 0.0) * (0.20 + 0.80 * spread * spread);
    float leafWrap = clamp((dot(n, key) + 0.34) / 1.34, 0.0, 1.0);
    float leafLight = (0.45 + leafWrap * 0.47 + throughLeaf * 0.25 + front * 0.16)
      * (0.78 + seed * 0.22);
    float leafRim = (margin * 0.47 + outline * 0.43 + pow(rim, 2.7) * 0.41)
      * (0.34 + facingKey * 0.59 + front * 0.11 + throughLeaf * 0.24);
    vec3 leaf = vec3(0.008, 0.039, 0.071)
      + vec3(0.075, 0.27, 0.39) * (0.23 * leafWrap + throughLeaf * 0.20)
      + vec3(0.26, 0.62, 0.82) * leafVeins * leafLight
      + vec3(0.51, 0.89, 0.99) * leafRim;

    float azimuth = tex.x * 6.283185;
    float tubeAcross = tex.x * mix(12.0, 26.0, pod) + pod * 0.14 * sin(tex.y * 5.5 + azimuth);
    float tubeAlong = tex.y * mix(15.0 + seed * 16.0, 34.0 + 6.0 * seed, pod)
      + pod * 0.08 * sin(azimuth * 3.0 + tex.y * 4.0);
    float tubing = max(gridLine(tubeAcross, 0.034), gridLine(tubeAlong, 0.027));
    float depthLight = mix(0.67, 1.0, front);
    float rimCore = (1.0 - smoothstep(0.11, 0.75, gaze))
      * (0.64 + facingKey * 0.44) * (0.78 + front * 0.22);
    float rimLine = 1.0 - smoothstep(0.035, 0.34, gaze);
    float wrap = pow(rim, 1.57) * (0.11 + 0.15 * facingKey);
    float shoulder = exp(-pow((tex.y - 0.102) * 23.0, 2.0)) * pod;
    float glint = shoulder * (0.27 * diffuse + pow(shine, 14.0) * 0.79 + pow(shine, 39.0) * 0.55);
    // Follow the lengthwise surface direction, keeping the highlight narrower across each pod.
    vec3 lengthwise = dFdy(vViewOffset) * dFdx(tex.x) - dFdx(vViewOffset) * dFdy(tex.x);
    float alongKey = dot(lengthwise, halfKey) * inversesqrt(max(dot(lengthwise, lengthwise), 0.0000001));
    float lobe = 0.65 + 0.35 * sin(3.0 * azimuth + tex.y * 7.0 + seed * 6.283185);
    float cuticle = pow(shine, 28.0 - 9.0 * seed) * exp2(-5.0 * alongKey * alongKey)
      * lobe * smoothstep(0.08, 0.19, tex.y) * (1.0 - smoothstep(0.61, 0.99, tex.y)) * pod;
    float jointLight = (1.0 - pod) * (0.27 + 0.63 * junction);
    float trunkShine = pow(shine, 8.5) * 0.47 * jointLight;
    float tubeLight = (diffuse * mix(0.57, 0.19, pod) + wrap) * depthLight;
    float tubeGrid = tubing * (0.17 + 0.33 * diffuse + 0.14 * junction) * depthLight;
    vec3 blueTube = vec3(0.005, 0.033, 0.064)
      + vec3(0.047, 0.41, 0.62) * tubeLight + vec3(0.13, 0.57, 0.76) * tubeGrid;
    vec3 ice = vec3(0.42, 0.96, 1.0);
    float blueRim = rimCore * mix(0.91 + 0.25 * junction, 0.87, pod)
      + rimLine * (0.17 + 0.27 * pod) + trunkShine;
    blueTube = mix(blueTube, ice, clamp(blueRim, 0.0, 1.0));
    blueTube += vec3(0.57, 0.86, 0.98) * (glint + cuticle * 0.43);

    float hotSide = smoothstep(-0.12, 0.75, n.x);
    float warmFresnel = pow(rim, 2.48) * (0.67 + 0.33 * front);
    vec3 warmTube = mix(vec3(0.052, 0.018, 0.061), vec3(0.44, 0.073, 0.074), hotSide * 0.68)
      + vec3(0.40, 0.25, 0.32) * tubeGrid;
    vec3 warmRim = mix(vec3(0.54, 0.89, 0.99), vec3(1.0, 0.62, 0.37), hotSide);
    warmTube = mix(warmTube, warmRim, clamp(warmFresnel * 0.94 + rimLine * 0.31, 0.0, 1.0));
    warmTube += vec3(0.84, 0.87, 0.96) * glint + vec3(0.27, 0.17, 0.12) * cuticle;

    float calyxTrace = pow(0.5 + 0.5 * cos(azimuth * 5.0 + seed * 6.283185), 3.0);
    float calyxLobe = smoothstep(0.65, 1.0, tex.y) * (0.38 + 0.62 * calyxTrace);
    vec3 calyx = vec3(0.008, 0.049, 0.063)
      + vec3(0.08, 0.37, 0.44) * (0.37 * diffuse + tubeGrid + calyxTrace * diffuse * 0.29)
      + vec3(0.29, 0.67, 0.74) * (rimLine * 0.57 + calyxLobe * 0.32 + pow(shine, 26.0) * 0.24);
    vec3 organColor = mix(mix(blueTube, warmTube, vOrgan.y), calyx, cap);
    vec3 color = mix(organColor, leaf, blade);
    // Lift the etched mids while leaving the converging stem and the background in shadow.
    color = pow(max(color, 0.0), vec3(0.84, 0.77, 0.79)) * vec3(1.0, 1.10, 1.07);
    float opacity = mix(0.88 + 0.12 * rimCore, 0.82 + 0.18 * max(margin, leafVeins), blade);
    gl_FragColor = vec4(clamp(color, 0.0, 1.0), min(opacity, 1.0) * smoothstep(0.001, 0.049, vHeight));
  }
`;

function point([x, y, z]) {
  return new THREE.Vector3(x - PIVOT[0], PIVOT[1] - y, z);
}

function curve(points) {
  return new THREE.CatmullRomCurve3(points.map(point), false, 'centripetal');
}

function normalizeLeafScan(image) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.min(512, image.naturalWidth);
  canvas.height = Math.round((image.naturalHeight / image.naturalWidth) * canvas.width);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const { width, height } = canvas;
  context.drawImage(image, 0, 0, width, height);
  const { data } = context.getImageData(0, 0, width, height);
  const luminance = (x, y) => {
    const index = (y * width + x) * 4;
    return data[index] * (data[index + 3] / 255);
  };

  // Map the silhouette to the leaf geometry's normalized, per-row width.
  const spans = [];
  for (let y = 0; y < height; y++) {
    let left = 0;
    let right = width - 1;
    while (left < right && luminance(left, y) < 14) left++;
    while (right > left && luminance(right, y) < 14) right--;
    spans.push({ left, right });
  }
  const first = spans.findIndex(({ left, right }) => right - left > 5);
  const last = spans.findLastIndex(({ left, right }) => right - left > 5);
  if (first < 0 || last <= first) return null;

  const columns = 256;
  const rows = 512;
  const strip = new Float32Array(columns * rows);
  for (let j = 0; j < rows; j++) {
    // A DataTexture starts at v = 0, which is the base of each blade.
    const sourceY = Math.round(THREE.MathUtils.lerp(last, first, j / (rows - 1)));
    const { left, right } = spans[sourceY];
    for (let i = 0; i < columns; i++) {
      const sourceX = THREE.MathUtils.lerp(left, right, i / (columns - 1));
      const pixel = Math.floor(sourceX);
      strip[j * columns + i] = THREE.MathUtils.lerp(
        luminance(pixel, sourceY),
        luminance(Math.min(pixel + 1, width - 1), sourceY),
        sourceX - pixel,
      );
    }
  }

  const textureData = new Uint8Array(columns * rows * 4);
  const sample = (x, y) =>
    strip[Math.max(0, Math.min(rows - 1, y)) * columns + Math.max(0, Math.min(columns - 1, x))];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < columns; i++) {
      const raw = strip[j * columns + i];
      const around =
        (sample(i - 3, j) + sample(i + 3, j) + sample(i, j - 4) + sample(i, j + 4)) / 4;
      const peak = Math.max(
        raw,
        sample(i - 1, j),
        sample(i + 1, j),
        sample(i, j - 1),
        sample(i, j + 1),
      );
      const index = (j * columns + i) * 4;
      textureData[index] = raw;
      textureData[index + 1] = THREE.MathUtils.clamp((peak - around) * 3.1, 0, 255);
      textureData[index + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(textureData, columns, rows);
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function buildPlantGeometry() {
  const positions = [];
  const uvs = [];
  const organs = [];
  const indices = [];
  const axis = new THREE.Vector3(0, 0, 1);
  const branchSamples = [];

  function addSurface(columns, rows, kind, ripe, shade, sample, reverse = false) {
    const first = positions.length / 3;
    for (let j = 0; j <= rows; j++) {
      const t = j / rows;
      const sampleRow = sample(t);
      for (let i = 0; i <= columns; i++) {
        const s = i / columns;
        positions.push(...sampleRow(s));
        uvs.push(s, t);
        organs.push(kind, ripe ? 1 : 0, shade);
        if (i === columns || j === rows) continue;
        const a = first + j * (columns + 1) + i;
        const b = a + columns + 1;
        if (reverse) indices.push(a, a + 1, b, b, a + 1, b + 1);
        else indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }

  function tubeFrame(path, t) {
    const center = path.getPoint(t);
    const tangent = path.getTangent(t);
    const side = new THREE.Vector3().crossVectors(tangent, axis).normalize();
    const depth = new THREE.Vector3().crossVectors(side, tangent).normalize();
    return { center, side, depth };
  }

  function addTube(path, radiusAt, options = {}) {
    const {
      kind = 0,
      ripe = false,
      shade = 0.65,
      rows = 30,
      columns = 12,
      paired = false,
      extent,
    } = options;
    addSurface(columns, rows, kind, ripe, shade, (t) => {
      const frame = extent ? null : tubeFrame(path, t);
      return (s) => {
        const angle = s * Math.PI * 2;
        const along = extent ? t * extent(angle) : t;
        const { center, side, depth } = frame ?? tubeFrame(path, along);
        const radius = radiusAt(along, angle);
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius * (paired ? 0.87 : 1);
        return [
          center.x + side.x * x + depth.x * z,
          center.y + side.y * x + depth.y * z,
          center.z + side.z * x + depth.z * z,
        ];
      };
    });
  }

  branches.forEach(([start, end, points], i) => {
    const path = curve(points);
    branchSamples.push(...path.getSpacedPoints(48));
    addTube(path, (t) => THREE.MathUtils.lerp(start, end, t), {
      rows: Math.max(14, Math.ceil(path.getLength() / 5.5)),
      shade: i === 0 ? 0.5 : 0.67,
    });
  });

  leaves.forEach(([bx, by, tx, ty, width, sweep, z, curl], i) => {
    const dx = tx - bx;
    const dy = by - ty;
    const length = Math.hypot(dx, dy);
    const ox = -dy / length;
    const oy = dx / length;
    const seed = (i * 0.618) % 1;
    const base = point([bx, by, z - curl * 9]);
    let nearestDistance = Infinity;
    let nearestBranch;
    for (const sample of branchSamples) {
      const distance =
        (sample.x - base.x) ** 2 + (sample.y - base.y) ** 2 + (sample.z - base.z) ** 2 * 0.09;
      if (distance >= nearestDistance) continue;
      nearestDistance = distance;
      nearestBranch = sample;
    }
    if (nearestDistance > 9) {
      const joint = nearestBranch.clone().lerp(base, 0.5);
      joint.z += 4;
      const petiole = new THREE.CatmullRomCurve3([nearestBranch, joint, base]);
      addTube(petiole, (t) => 1.75 - t * 0.82, { rows: 8, columns: 8, shade: 0.73 });
    }
    addSurface(
      20,
      36,
      1,
      false,
      0.36 + seed * 0.47,
      (t) => {
        const arch = Math.sin(Math.PI * t);
        const taper = Math.max(0.002, Math.sin(Math.PI * t ** 0.9) ** 1.17 * (1.1 - t * 0.36));
        const halfWidth = taper * width * (1.2 + seed * 0.19);
        const lift = 0.99 + t * (0.16 + seed * 0.21);
        const bend = arch * lift;
        const bendSlope = Math.PI * Math.cos(Math.PI * t) * lift + arch * (0.16 + seed * 0.21);
        const centerX = bx - PIVOT[0] + dx * t + ox * sweep * bend;
        const centerY = PIVOT[1] - by + dy * t + oy * sweep * bend;
        const forwardX = dx + ox * sweep * bendSlope;
        const forwardY = dy + oy * sweep * bendSlope;
        const acrossLength = Math.hypot(forwardX, forwardY);
        return (s) => {
          const side = 2 * s - 1;
          const edgeRipple = 1 + 0.032 * Math.sin(t * 60 + 1.9 * side) * side * side;
          const widthBias = 0.95 + side * (curl * 0.11 + 0.05 * Math.sin(t * 5 + seed * 7));
          const offset = halfWidth * side * edgeRipple * widthBias;
          const fold = halfWidth * (0.45 * Math.abs(side) + side * curl * (0.2 + 0.16 * t));
          const depth = z + arch * (12.0 + seed * 12 - fold) + (t - 0.5) * curl * 18;
          return [
            centerX - (forwardY * offset) / acrossLength,
            centerY + (forwardX * offset) / acrossLength,
            depth,
          ];
        };
      },
      true,
    );
  });

  fruits.forEach(({ stem, points, radius, ripe }, i) => {
    const seed = (i * 0.732) % 1;
    const body = curve(points);
    const stemPoints = [...stem, points[0]];
    addTube(curve(stemPoints), (t) => THREE.MathUtils.lerp(1.2, 2.35 + radius * 0.062, t), {
      rows: 15,
      shade: 0.88,
    });
    const envelope = (t) => {
      const rise = Math.min(t / (0.115 + seed * 0.028), 1);
      const shoulder = 0.16 + 0.84 * Math.sqrt(1 - (1 - rise) ** 2);
      const taper = Math.pow(1 - t ** (1.24 + seed * 0.23), 0.81 + 0.23 * seed);
      return taper * shoulder + 0.012;
    };
    const podRadius = (t, angle) =>
      radius * envelope(t) * (0.99 + 0.045 * Math.cos(angle * 3 + 0.22) * (1 - t));
    addTube(body, podRadius, {
      kind: 2,
      ripe,
      shade: 0.78 + seed * 0.22,
      columns: 28,
      rows: 52,
      paired: true,
    });
    const calyxPhase = seed * Math.PI * 2;
    const calyxExtent = (angle) => {
      const lobe = 0.5 + 0.5 * Math.cos(angle * 5 + calyxPhase);
      return 0.046 + 0.046 * lobe ** 1.7;
    };
    addTube(body, (t, angle) => podRadius(t, angle) * (1.053 - t * 0.24), {
      kind: 3,
      shade: seed,
      rows: 9,
      columns: 30,
      paired: true,
      extent: calyxExtent,
    });
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('organ', new THREE.Float32BufferAttribute(organs, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function mountChiliPlant(container, { leafUrl } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'low-power',
    });
  } catch {
    container.dataset.renderer = 'unavailable';
    return () => {};
  }

  const scene = new THREE.Scene();
  const neutralScan = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  neutralScan.needsUpdate = true;
  const uniforms = {
    time: { value: 0 },
    leafScan: { value: neutralScan },
    scanReady: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide,
    transparent: true,
    forceSinglePass: true,
  });
  const geometry = buildPlantGeometry();
  const plant = new THREE.Mesh(geometry, material);
  scene.add(plant);

  const camera = new THREE.OrthographicCamera(-WIDTH / 2, WIDTH / 2, HEIGHT - 2, -2, 1, 1800);
  camera.position.z = 1000;
  renderer.setClearColor(0, 0);
  const bloom = createPlantBloom(renderer);
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {
    width: '100%',
    height: '100%',
    display: 'block',
    pointerEvents: 'none',
  });
  container.append(canvas);
  container.dataset.renderer = 'webgl';
  container.tabIndex = 0;
  if (!container.hasAttribute('aria-label')) {
    container.setAttribute('aria-label', '辣椒植株三维模型，可拖动或使用方向键旋转，Home 键复位');
  }
  container.style.touchAction = 'pan-y';

  const controller = new AbortController();
  const listener = { signal: controller.signal };
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0;
  let last = 0;
  let drag;
  let active = true;
  let lost = false;
  let disposed = false;

  function draw(now) {
    frame = 0;
    if (!active || lost || disposed || document.hidden) return;
    if (motion.matches || !last || now - last >= 1000 / 30 - 2) {
      if (!motion.matches && last) uniforms.time.value += Math.min((now - last) / 1000, 0.07);
      last = now;
      bloom.render(scene, camera);
    }
    if (!motion.matches) queue();
  }

  function queue() {
    if (!frame && active && !lost && !disposed && !document.hidden) {
      frame = requestAnimationFrame(draw);
    }
  }

  function updateSize() {
    const bounds = container.getBoundingClientRect();
    const ratio = THREE.MathUtils.clamp(
      (bounds.width / WIDTH) * (devicePixelRatio || 1),
      0.45,
      1.7,
    );
    renderer.setPixelRatio(ratio);
    renderer.setSize(WIDTH, HEIGHT, false);
    bloom.resize(canvas.width, canvas.height);
    queue();
  }

  function rotate(yaw, pitch) {
    plant.rotation.set(THREE.MathUtils.clamp(pitch, -0.38, 0.38), yaw, 0, 'YXZ');
    container.dataset.yaw = yaw.toFixed(3);
    queue();
  }

  container.addEventListener(
    'pointerdown',
    (event) => {
      if (!event.isPrimary || event.button !== 0) return;
      drag = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        yaw: plant.rotation.y,
        pitch: plant.rotation.x,
      };
      container.setPointerCapture(event.pointerId);
    },
    listener,
  );
  container.addEventListener(
    'pointermove',
    (event) => {
      if (drag?.id !== event.pointerId) return;
      rotate(
        drag.yaw + (event.clientX - drag.x) * 0.008,
        drag.pitch + (event.clientY - drag.y) * 0.003,
      );
    },
    listener,
  );
  container.addEventListener(
    'lostpointercapture',
    () => {
      drag = undefined;
    },
    listener,
  );
  container.addEventListener(
    'keydown',
    (event) => {
      const yaw = plant.rotation.y;
      const pitch = plant.rotation.x;
      if (event.key === 'ArrowLeft') rotate(yaw - 0.15, pitch);
      else if (event.key === 'ArrowRight') rotate(yaw + 0.15, pitch);
      else if (event.key === 'ArrowUp') rotate(yaw, pitch - 0.05);
      else if (event.key === 'ArrowDown') rotate(yaw, pitch + 0.05);
      else if (event.key === 'Home') rotate(0, 0);
      else return;
      event.preventDefault();
    },
    listener,
  );

  motion.addEventListener(
    'change',
    () => {
      last = 0;
      queue();
    },
    listener,
  );
  document.addEventListener(
    'visibilitychange',
    () => {
      last = 0;
      queue();
    },
    listener,
  );
  canvas.addEventListener(
    'webglcontextlost',
    (event) => {
      event.preventDefault();
      lost = true;
      container.dataset.renderer = 'unavailable';
    },
    listener,
  );
  canvas.addEventListener(
    'webglcontextrestored',
    () => {
      lost = false;
      last = 0;
      container.dataset.renderer = 'webgl';
      updateSize();
    },
    listener,
  );

  if (leafUrl) {
    const image = new Image();
    image.addEventListener(
      'load',
      () => {
        if (disposed) return;
        let scan;
        try {
          scan = normalizeLeafScan(image);
        } catch {
          return;
        }
        if (!scan) return;
        uniforms.leafScan.value = scan;
        uniforms.scanReady.value = 1;
        container.dataset.leafTexture = 'ready';
        queue();
      },
      { ...listener, once: true },
    );
    image.src = leafUrl;
  }

  const intersection = new IntersectionObserver(([entry]) => {
    active = entry.isIntersecting;
    last = 0;
    queue();
  });
  intersection.observe(container);
  window.addEventListener('resize', updateSize, listener);
  container.dataset.yaw = '0.000';
  updateSize();

  return () => {
    if (disposed) return;
    disposed = true;
    controller.abort();
    intersection.disconnect();
    cancelAnimationFrame(frame);
    geometry.dispose();
    material.dispose();
    if (uniforms.leafScan.value !== neutralScan) uniforms.leafScan.value.dispose();
    neutralScan.dispose();
    bloom.dispose();
    renderer.dispose();
    delete container.dataset.leafTexture;
    canvas.remove();
  };
}
