import * as T from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { fx, patchSurface, projectionMaterial, projectionDepth, setPhase } from './phase.js';
import { MATERIAL_END } from './sequence.js';
import materialFlags from './materials.json';

function studioProbe(renderer) {
  const room = new T.Scene();
  room.background = new T.Color(0.074, 0.1, 0.126);
  const panels = [];
  const panel = (x, y, z, w, h, c) => {
    const g = new T.PlaneGeometry(w, h),
      m = new T.MeshBasicMaterial({
        color: new T.Color(...c),
        side: T.DoubleSide,
        toneMapped: false,
      });
    const o = new T.Mesh(g, m);
    o.position.set(x, y, z);
    o.lookAt(0, 0, 0);
    room.add(o);
    panels.push(o);
  };
  panel(9, 9, 1, 26, 5, [1.55, 2.37, 3.0]);
  panel(-9, 5, 2, 29, 2.2, [2.65, 1.52, 0.73]);
  panel(0, 13, -2, 23, 4, [1.15, 1.65, 2.15]);
  panel(4, 3, 11, 12, 1.3, [1.57, 1.84, 1.89]);
  for (let j = 0; j < 8; j++) {
    const a = (j * Math.PI) / 4;
    panel(Math.cos(a) * 13, 3.6, Math.sin(a) * 13, 0.45, 8.2, [1.7, 2.37, 2.6]);
  }
  const maker = new T.PMREMGenerator(renderer);
  const rt = maker.fromScene(room, 0.04, 0.1, 100);
  maker.dispose();
  panels.forEach((o) => {
    o.geometry.dispose();
    o.material.dispose();
  });
  return rt;
}

function lunarMaterial(old) {
  const tex = old.map || old.emissiveMap;
  if (!tex) return old;
  tex.updateMatrix();
  return new T.ShaderMaterial({
    name: 'Lunar cartography',
    uniforms: { chart: { value: tex }, chartMatrix: { value: tex.matrix } },
    vertexShader: `uniform mat3 chartMatrix;varying vec2 vChart;varying vec3 vNormalWorld;void main(){
      vChart=(chartMatrix*vec3(uv,1.)).xy;vNormalWorld=(vec4(normalMatrix*normal,0.)*viewMatrix).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform sampler2D chart;varying vec2 vChart;varying vec3 vNormalWorld;void main(){
      float k=dot(normalize(vNormalWorld),normalize(vec3(-.24,.58,.78)));
      vec3 albedo=texture2D(chart,vChart).rgb;
      vec3 color=mix(vec3(.10,.21,.29),vec3(3.55,3.63,3.24),smoothstep(-.04,.80,k))*albedo;
      gl_FragColor=vec4(color,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  });
}
function inheritance(object, key) {
  for (let o = object; o; o = o.parent) if (o.userData[key]) return o.userData[key];
  return null;
}
function copyMapFlags(from, into) {
  into.name = from.name;
  into.side = from.side;
  into.transparent = from.transparent;
  into.opacity = from.opacity;
  into.depthWrite = from.depthWrite;
  into.alphaTest = from.alphaTest;
  return into;
}

export function buildWorld(renderer, gltf, sky) {
  const scene = new T.Scene();
  const probe = studioProbe(renderer);
  scene.environment = probe.texture;
  scene.environmentIntensity = 0.72;
  sky.colorSpace = T.SRGBColorSpace;
  sky.mapping = T.EquirectangularReflectionMapping;
  scene.background = sky;
  scene.backgroundIntensity = 0.63;
  scene.fog = new T.FogExp2(0x1a3542, 0.0068);
  const model = gltf.scene;
  scene.add(model);
  model.updateMatrixWorld(true);
  const train = model.getObjectByName('WS700_Consist');
  if (!train) throw new Error('未找到列车编组');
  // Use the actual Blender animation; the sampled keys are also retained in the source package.
  const clip = gltf.animations.find((c) =>
    c.tracks.some((tr) => tr.name.includes('WS700_Consist')),
  );
  if (!clip) throw new Error('未找到进站动画');
  const mixer = new T.AnimationMixer(model);
  const action = mixer.clipAction(clip);
  action.setLoop(T.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
  const mats = new Map(),
    holoMats = new Map(),
    solids = [],
    projections = [],
    wetMeshes = [];
  const trainDepth = projectionDepth(true),
    platformDepth = projectionDepth(false);
  const sourceMaterials = new Set();
  const raw = [];
  model.traverse((o) => {
    if (o.isMesh) raw.push(o);
  });
  const names = new Set();
  for (const mesh of raw) {
    const target = inheritance(mesh, 'fxTarget'),
      part = inheritance(mesh, 'sourcePart');
    const old = mesh.material;
    sourceMaterials.add(old);
    const name = old.name;
    names.add(name);
    const wet = name.startsWith('Basalt |');
    const stone = wet || name.startsWith('Pale granite') || name.startsWith('Crushed ballast');
    const key = name + '|' + (target || '');
    if (!mats.has(key)) {
      let m = old.clone();
      const cfg = materialFlags[name] || {};
      if (name.startsWith('Celestial globe')) m = lunarMaterial(old);
      else {
        if (
          /^(Arrivals board|Station identification|Platform information|City \| occupied)/.test(
            name,
          )
        ) {
          const gain = name.startsWith('City') ? 0.9 : 1.25;
          m = copyMapFlags(
            old,
            new T.MeshBasicMaterial({
              map: old.map || old.emissiveMap,
              color: new T.Color(gain, gain, gain),
            }),
          );
        } else if (name.startsWith('WS 700 | saloon ')) {
          m.roughness = 0.18;
          m.metalness = 0.2;
          m.emissiveIntensity = 1.22;
        } else if (cfg.decal) {
          m.transparent = false;
          m.alphaTest = 0.3;
          m.depthWrite = false;
          m.polygonOffset = true;
          m.polygonOffsetFactor = -0.65;
        } else if (cfg.alpha < 1) {
          m.transparent = true;
          m.opacity = cfg.alpha;
          m.depthWrite = false;
          m.side = T.FrontSide;
        } else if (m.isMeshStandardMaterial) {
          m.envMapIntensity = /visor|lacquer|upper pearl|rail head/i.test(name) ? 1.23 : 0.77;
          if (name.startsWith('Light |'))
            m.emissiveIntensity *= name.includes('warm phosphorus') ? 0.53 : 0.65;
          if (wet) {
            m.color.setRGB(0.054, 0.073, 0.081);
            m.roughness = 0.28;
            m.metalness = 0.18;
          }
          if (name.startsWith('Crushed ballast')) {
            m.roughness = 0.77;
            m.color.setRGB(0.085, 0.081, 0.066);
          }
        }
        patchSurface(m, target, { wet, stone });
      }
      mats.set(key, m);
    }
    mesh.material = mats.get(key);
    mesh.castShadow =
      (target === 'train' && /pearl|fairing|graphite|cab laminated/.test(name)) ||
      (part === '01' && /Titanium|Porcelain/.test(name));
    if (mesh.castShadow && target)
      mesh.customDepthMaterial = target === 'train' ? trainDepth : platformDepth;
    mesh.receiveShadow = part === '02' || part === '04' || part === '03';
    if (wet) wetMeshes.push(mesh);
    if (target) {
      solids.push(mesh);
      const isTrain = target === 'train',
        trim = /Light \||lamp|Light|signal/.test(name);
      // Seats, stickers and tiny internal trim dissolve with the opaque pass. The exterior
      // pressure shell, glazing, doors, decks and girders carry the readable projection.
      const omit = /transfer|stencil|Elastomer|Tactile brass|badge/i.test(name);
      if (!omit) {
        const pane = /saloon \d/.test(name) ? 1 : name.includes('cab laminated') ? 2 : 0;
        const deck = part === '02',
          map = pane === 1 ? old.map : null;
        const mk = [target, trim, pane, deck, map?.uuid || ''].join('/');
        if (!holoMats.has(mk)) holoMats.set(mk, projectionMaterial(isTrain, trim, pane, deck, map));
        const shell = new T.Mesh(mesh.geometry, holoMats.get(mk));
        shell.name = 'Projection / ' + mesh.name;
        shell.matrix.copy(mesh.matrix);
        shell.matrixAutoUpdate = false;
        shell.frustumCulled = true;
        shell.renderOrder = trim ? 9 : pane ? 8 : 6;
        shell.visible = false;
        mesh.parent.add(shell);
        projections.push(shell);
      }
    }
  }
  const hemi = new T.HemisphereLight(0xb3d5ec, 0x3e3023, 0.55);
  scene.add(hemi);
  const key = new T.DirectionalLight(0xd1e6ff, 1.24);
  key.position.set(17, 29, 13);
  key.target.position.set(0, 0, 1);
  scene.add(key, key.target);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, {
    left: -40,
    right: 40,
    top: 52,
    bottom: -46,
    near: 0.5,
    far: 125,
  });
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.normalBias = 0.055;
  key.shadow.bias = -0.00025;
  const rimLight = new T.DirectionalLight(0xffbe82, 0.74);
  rimLight.position.set(-16, 10, -9);
  scene.add(rimLight);
  for (const [x, z, clr, power] of [
    [6, 31, 0xb4ddff, 230],
    [6, 8, 0xb4deff, 225],
    [6, -19, 0x9dd1ff, 210],
    [6, -46, 0xadddff, 175],
    [-8, 26, 0xffb069, 155],
    [-8, -8, 0xffb06b, 148],
  ]) {
    const l = new T.PointLight(clr, power, 35, 2);
    l.position.set(x, x < 0 ? 6.4 : 9.8, z);
    scene.add(l);
  }
  const lamps = [];
  for (const sign of [-1, 1]) {
    const l = new T.SpotLight(0xd4edff, 140, 29, 0.32, 0.64, 2);
    l.position.set(sign * 1.08, 1.32, -1.03);
    l.target.position.set(sign * 1.06, 0.24, 18);
    train.add(l, l.target);
    lamps.push(l);
  }
  // One clipped, low-resolution planar view is sampled by both wet stone decks.
  const mirror = new Reflector(new T.PlaneGeometry(1, 1), {
    textureWidth: 832,
    textureHeight: 468,
    clipBias: 0.003,
    multisample: 0,
  });
  mirror.rotation.x = -Math.PI / 2;
  mirror.position.y = 1.298;
  mirror.updateMatrixWorld(true);
  fx.uWetMap.value = mirror.getRenderTarget().texture;
  const biased = new T.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
  let lastReflect = -100,
    lastPhase = false;
  function update(t) {
    action.enabled = true;
    action.paused = false;
    mixer.setTime(Math.min(clip.duration - 0.000001, t));
    model.updateMatrixWorld(true);
    setPhase(t, train.getWorldPosition(trainPos).z);
    const active = fx.uPhaseOn.value === 1;
    if (active !== lastPhase) {
      for (const shell of projections) shell.visible = active;
      lastPhase = active;
    }
    const complete = t >= MATERIAL_END;
    for (const m of solids) m.visible = !complete;
    lamps.forEach((l) =>
      l.color.setHex(
        fx.uPhaseOn.value > 0.5 && fx.uFront.value < trainPos.z - 1.25 ? 0x58d9ff : 0xd4edff,
      ),
    );
  }
  // Capture the actual occupied volume around the track as a stationary radiance probe.
  // The empty carriage shader and the physical paint both reflect the original vault.
  const cubeTarget = new T.WebGLCubeRenderTarget(160, {
    type: T.HalfFloatType,
    generateMipmaps: false,
  });
  const cube = new T.CubeCamera(0.35, 290, cubeTarget);
  cube.position.set(0, 2.85, 15);
  train.visible = false;
  for (const o of wetMeshes) o.visible = false;
  scene.add(cube);
  cube.update(renderer, scene);
  scene.remove(cube);
  train.visible = true;
  for (const o of wetMeshes) o.visible = true;
  const prefilter = new T.PMREMGenerator(renderer);
  const railProbe = prefilter.fromCubemap(cubeTarget.texture);
  prefilter.dispose();
  cubeTarget.dispose();
  for (const [id, m] of mats) {
    if (id.endsWith('|train') && m.isMeshStandardMaterial) {
      m.envMap = railProbe.texture;
      m.envMapIntensity = m.name.includes('cab laminated') ? 1.26 : 0.97;
      m.needsUpdate = true;
    }
  }
  const trainPos = new T.Vector3();
  function reflection(camera, stamp, force = false) {
    if (!force && stamp - lastReflect < 55) return;
    lastReflect = stamp;
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld();
    const visibility = wetMeshes.map((o) => o.visible);
    for (const o of wetMeshes) o.visible = false;
    mirror.onBeforeRender(renderer, scene, camera);
    wetMeshes.forEach((o, i) => {
      o.visible = visibility[i];
    });
    const reflected = mirror.getReflectionCamera(camera);
    fx.uWetMatrix.value
      .copy(biased)
      .multiply(reflected.projectionMatrix)
      .multiply(reflected.matrixWorldInverse);
  }
  function dispose() {
    mixer.stopAllAction();
    mixer.uncacheRoot(model);
    const geometries = new Set(raw.map((mesh) => mesh.geometry));
    const textures = new Set();
    for (const mat of sourceMaterials) {
      for (const value of Object.values(mat)) if (value?.isTexture) textures.add(value);
    }
    for (const mat of [
      ...sourceMaterials,
      ...mats.values(),
      ...holoMats.values(),
      trainDepth,
      platformDepth,
    ])
      mat.dispose();
    for (const geometry of geometries) geometry.dispose();
    for (const texture of textures) {
      texture.dispose();
      texture.source.data?.close?.();
    }
    mirror.dispose();
    mirror.geometry.dispose();
    key.shadow.dispose();
    probe.dispose();
    railProbe.dispose();
    sky.dispose();
    fx.uWetMap.value = null;
  }
  return { scene, update, reflection, dispose };
}
