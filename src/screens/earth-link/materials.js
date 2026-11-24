/* SPDX-License-Identifier: MIT */
import {
  AdditiveBlending,
  BackSide,
  DoubleSide,
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
} from 'three/webgpu';
import {
  attribute,
  cameraPosition,
  color,
  float,
  mix,
  modelWorldMatrixInverse,
  normalMap,
  normalWorldGeometry,
  output,
  positionGeometry,
  positionWorld,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';

export function earthMaterials([day, night, detail, cloudsMap], sunDirection, cloudOffset) {
  const towardCamera = cameraPosition.sub(positionWorld).normalize();
  const sunAngle = normalWorldGeometry.dot(sunDirection).toVar();
  const rim = normalWorldGeometry.dot(towardCamera).abs().toVar();
  const daylight = sunAngle.smoothstep(-0.18, 0.27).toVar();
  const twilight = sunAngle.abs().div(0.36).oneMinus().saturate().pow(2);
  const air = mix(color('#448fce'), color('#ec9469'), twilight.mul(0.6));

  const terrain = texture(day).rgb.toVar();
  const cloudUv = uv().add(vec2(cloudOffset, 0));
  const clouds = texture(cloudsMap, cloudUv).r.smoothstep(0.06, 0.92).mul(0.9).toVar();
  const cities = texture(night).rgb.mul(vec3(1.18, 1.13, 1.18));
  const nightSide = mix(cities.add(terrain.mul(0.027)), color('#192b3b'), clouds.mul(0.48));

  const surface = new MeshStandardNodeMaterial({ metalness: 0, roughness: 0.82 });
  surface.colorNode = mix(terrain, color('#e5edf1'), clouds);
  const openWater = terrain.b
    .sub(terrain.r.mul(1.25))
    .smoothstep(0.008, 0.047)
    .mul(clouds.oneMinus());
  surface.roughnessNode = mix(float(0.82), float(0.32), openWater);
  surface.normalNode = normalMap(texture(detail), vec2(0.23));
  const glow = air.mul(rim.oneMinus().pow(2.45)).mul(daylight.mul(0.49).add(0.06));
  surface.outputNode = vec4(mix(nightSide, output.rgb, daylight).add(glow), output.a);

  const atmosphere = new MeshBasicNodeMaterial({
    side: BackSide,
    transparent: true,
    depthWrite: false,
  });
  const shellOpacity = rim.smoothstep(0, 0.24).pow(1.6).mul(daylight.mul(0.66).add(0.12));
  atmosphere.outputNode = vec4(air, shellOpacity);
  return { surface, atmosphere };
}

export function linkMaterial(time, length, index) {
  const highlighted = uniform(0);
  const across = uv().y.mul(2).sub(1);
  const localEye = modelWorldMatrixInverse.mul(vec4(cameraPosition, 1)).xyz;
  const side = attribute('arcTangent', 'vec3').cross(localEye.sub(positionGeometry)).toVar();
  const direction = side.div(side.length().max(0.0001));
  const material = new MeshBasicNodeMaterial({
    side: DoubleSide,
    forceSinglePass: true,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  material.positionNode = positionGeometry.add(direction.mul(across).mul(0.035));

  // The pulse travels in sphere-radius units. Let the tail finish at the destination
  // before the next pulse departs, including on short station-to-station links.
  const tailLength = Math.min(length * 0.42, 0.48);
  const travel = length + tailLength + 0.045;
  const speed = 0.225 + (index % 3) * 0.025;
  const offset = ((0.28 + index * 0.213) % 1) * travel;
  const behind = time.mul(speed).add(offset).mod(travel).sub(uv().x.mul(length)).sub(0.022).toVar();
  const bell = (x) => x.mul(x).negate().exp();
  const head = bell(behind.div(0.018)).toVar();
  const tail = behind
    .smoothstep(-0.022, 0.006)
    .mul(behind.max(0).div(tailLength).oneMinus().saturate().pow(1.65))
    .toVar();
  const core = bell(across.div(tail.mul(0.1).add(0.11))).toVar();
  const shoulder = bell(across.div(tail.mul(0.24).add(0.16)));
  const halo = bell(across.div(0.66)).mul(across.abs().smoothstep(0.72, 1).oneMinus());
  const spine = bell(across.div(0.087)).mul(highlighted.mul(0.19).add(0.23));
  const hue = mix(color('#48dbf4'), color('#ff9a4e'), highlighted);
  const hot = mix(color('#ddfcff'), color('#fff3cc'), highlighted);
  material.colorNode = mix(hue, hot, core.mul(tail).add(head.mul(0.82)).saturate()).mul(1.5);
  material.opacityNode = spine
    .add(core.mul(tail))
    .add(shoulder.mul(tail.mul(0.56).add(head.mul(0.52))))
    .add(halo.mul(tail.mul(0.23).add(head.mul(0.32))))
    .saturate();
  return { material, highlighted };
}
