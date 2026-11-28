import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildWorld } from './world.js';
import { poseCamera } from './sequence.js';

async function readModel(url, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error('模型响应 ' + response.status);
  const bytes = await response.arrayBuffer();
  // Hosting may already have decoded a gzip Content-Encoding response.
  if (new Uint8Array(bytes)[0] !== 0x1f) return bytes;
  return new Response(
    new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')),
  ).arrayBuffer();
}

export async function createRenderer(container, assets, signal, invalidate) {
  const renderer = new T.WebGLRenderer({
    antialias: false,
    powerPreference: 'high-performance',
    stencil: false,
  });
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.94;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFShadowMap;
  renderer.setClearColor(0x10232e);
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-label', '实时三维站台与列车');
  container.append(canvas);
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  let world, composer, observer, orbit, sky;
  function dispose() {
    observer?.disconnect();
    orbit?.dispose();
    for (const pass of composer?.passes ?? []) pass.dispose();
    composer?.dispose();
    world?.dispose();
    if (!world) sky?.dispose();
    renderer.dispose();
    canvas.remove();
    if (!renderer.getContext().isContextLost()) renderer.forceContextLoss();
  }
  try {
    const [gltf, environment] = await Promise.all([
      readModel(assets.model, signal).then((data) => loader.parseAsync(data, '')),
      new T.TextureLoader().loadAsync(assets.sky),
    ]);
    sky = environment;
    signal.throwIfAborted();
    world = buildWorld(renderer, gltf, sky);
    const camera = new T.PerspectiveCamera(42, 1, 0.38, 390);
    const look = new T.Vector3();
    orbit = new OrbitControls(camera, canvas);
    orbit.enabled = false;
    orbit.enableDamping = false;
    orbit.minDistance = 2.2;
    orbit.maxDistance = 145;
    orbit.maxPolarAngle = Math.PI * 0.493;
    orbit.addEventListener('change', invalidate);
    const target = new T.WebGLRenderTarget(1, 1, {
      type: T.HalfFloatType,
      samples: Math.min(2, renderer.capabilities.maxSamples),
    });
    composer = new EffectComposer(renderer, target);
    composer.addPass(new RenderPass(world.scene, camera));
    const bloom = new UnrealBloomPass(new T.Vector2(640, 360), 0.32, 0.3, 1.15);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    let pixelLimit = window.self === window.top ? 1650000 : 800000;
    let forceReflect = true,
      lastShot,
      previousTime;
    function resize() {
      const w = Math.max(1, container.clientWidth),
        h = Math.max(1, container.clientHeight);
      const ratio = Math.min(devicePixelRatio || 1, 1.4, Math.sqrt(pixelLimit / (w * h)));
      renderer.setPixelRatio(ratio);
      renderer.setSize(w, h, false);
      composer.setPixelRatio(ratio);
      composer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      forceReflect = true;
      invalidate();
    }
    observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();
    let consecutiveSlow = 0,
      previousStamp = 0;
    function draw(time, stamp) {
      world.update(time);
      if (!orbit.enabled) {
        const shot = poseCamera(camera, time, look);
        forceReflect ||= lastShot !== shot;
        lastShot = shot;
      }
      world.reflection(
        camera,
        stamp,
        forceReflect || previousTime === undefined || Math.abs(time - previousTime) > 0.35,
      );
      forceReflect = false;
      previousTime = time;
      composer.render();
      const elapsed = stamp - previousStamp;
      previousStamp = stamp;
      if (elapsed > 64 && elapsed < 700) consecutiveSlow++;
      else consecutiveSlow = 0;
      if (consecutiveSlow >= 12 && pixelLimit > 480000) {
        pixelLimit = Math.max(480000, Math.round(pixelLimit * 0.72));
        consecutiveSlow = 0;
        resize();
      }
    }
    function setFree(enabled) {
      if (enabled) orbit.target.copy(look);
      orbit.enabled = enabled;
      if (enabled) orbit.update();
      canvas.style.cursor = enabled ? 'grab' : '';
      forceReflect = true;
      invalidate();
    }
    return { draw, setFree, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
