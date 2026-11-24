/* SPDX-License-Identifier: MIT */
import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { gsap } from 'gsap';
import { applyFinish } from './finish.js';
import { carProfile, flowField } from './airflow.js';
import { makeStudio } from './studio.js';

const directions = { hero: [0.76, 0.24, 0.64], side: [1, 0.15, 0.015], top: [0.015, 1, 0.018] };
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const wrap = (a) => T.MathUtils.euclideanModulo(a + Math.PI, 2 * Math.PI) - Math.PI;

function release(root, extra = []) {
  const geometries = new Set(),
    materials = new Set(extra),
    textures = new Set();
  root.traverse((obj) => {
    if (obj.geometry) geometries.add(obj.geometry);
    if (obj.material) {
      const list = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of list) materials.add(m);
    }
  });
  for (const mat of materials) {
    for (const v of Object.values(mat)) if (v?.isTexture) textures.add(v);
    mat.dispose();
  }
  for (const g of geometries) g.dispose();
  for (const t of textures) {
    t.dispose();
    t.source?.data?.close?.();
  }
}

function collectVehicle(gltf, filename, livery) {
  const group = new T.Group();
  group.add(gltf.scene);
  const sourceMaterials = new Set(),
    meshes = [],
    painted = [];
  group.traverse((obj) => {
    if (obj.isMesh) {
      meshes.push(obj);
      sourceMaterials.add(obj.material);
    }
  });
  if (!meshes.length) throw new Error('GLB 中没有三角网格');
  const bounds = new T.Box3().setFromObject(group, true),
    size = bounds.getSize(new T.Vector3());
  if (!Number.isFinite(size.length()) || Math.max(size.x, size.z) < 0.00001)
    throw new Error('模型尺寸无效');
  if (size.x > size.z) group.rotation.y = Math.PI / 2;
  bounds.setFromObject(group, true);
  const center = bounds.getCenter(new T.Vector3());
  const nose = meshes.find((m) => /headlights?|frontbumper/i.test(m.name + ' ' + m.material.name));
  if (nose && new T.Box3().setFromObject(nose).getCenter(new T.Vector3()).z < center.z)
    group.rotation.y += Math.PI;
  group.scale.setScalar(5 / Math.max(size.x, size.z));
  // Rotated wheel bounding boxes extend below the tread. Use actual vertices
  // for ground contact and for the reflection plane.
  bounds.setFromObject(group, true);
  bounds.getCenter(center);
  group.position.set(-center.x, 0.006 - bounds.min.y, -center.z);
  group.updateMatrixWorld(true);
  const wheels = [];
  for (const m of meshes) {
    const mat = m.material,
      name = mat.name || '';
    const glass = /^(Glass$)|_mm_windows_/i.test(name);
    m.castShadow = !glass;
    m.receiveShadow = !glass;
    if (glass) {
      mat.transmission = 0;
      mat.transparent = true;
      mat.opacity = 0.62;
      mat.roughness = 0.09;
      mat.metalness = 0.2;
      mat.depthWrite = false;
      mat.color.set('#24333b');
      mat.envMapIntensity = 0.83;
    }
    if (/^Interior 3 Carmine$/i.test(name)) mat.color.set('#74372a');
    if (/^Paint 2\b/.test(name)) {
      mat.color.set('#222b2f');
      mat.roughness = 0.32;
      mat.metalness = 0.55;
      mat.normalScale?.multiplyScalar(0.18);
    }
    if (/tire|tyre/i.test(name)) {
      mat.metalness = 0.04;
      mat.roughness = 0.8;
    }
    if (/tiretread|_mm_tyre_/i.test(name)) {
      const tire = new T.Box3().setFromObject(m, true),
        p = tire.getCenter(new T.Vector3());
      if (tire.max.z - tire.min.z < 1.4 && !wheels.some((w) => w.distanceTo(p) < 0.16))
        wheels.push(p);
    }
    if (/^Headlight$/i.test(name)) {
      mat.emissive.set('#dbf6ff');
      mat.emissiveIntensity = 2.2;
    }
    if (
      /^Paint 1\b|(?:HOOD|BODY|MIRROR_(?:LEFT|RIGHT)|WING_REAR|FRONTBUMPER|REARBUMPER|DOOR_(?:RIGHT|LEFT)|BOOT)_mm_ext_/i.test(
        name,
      )
    ) {
      painted.push(m);
    }
  }
  if (!painted.length) {
    for (const m of meshes)
      if (/paint|body|coat/i.test(m.material.name + ' ' + m.name) && !m.material.transparent)
        painted.push(m);
  }
  const extras = gltf.parser.json.asset.extras || {};
  const known = /centenario/i.test((extras.title || '') + ' ' + filename);
  const official =
    !filename || /Darmstadt Graphics Group/.test(gltf.parser.json.asset.copyright || '');
  const profile = carProfile(meshes, bounds.max.y - bounds.min.y, group.scale.x);
  return {
    group,
    sourceMaterials,
    wheels,
    finish: applyFinish(painted, livery, bounds.max.y - bounds.min.y),
    count: painted.length,
    field: flowField(profile.sample),
    section: profile.section,
    model: known
      ? { name: 'CENTENARIO', make: 'LAMBORGHINI / 2017', privateCar: true }
      : official
        ? { name: 'CAR CONCEPT', make: 'KHRONOS DESIGN STUDY' }
        : { name: filename.replace(/\.glb$/i, ''), make: 'LOCAL DESIGN STUDY', custom: true },
  };
}

export class VehicleStudio {
  constructor(host, events) {
    this.host = host;
    this.events = events;
    this.canvas = host.querySelector('canvas');
    this.renderer = new T.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      stencil: true,
      powerPreference: 'high-performance',
    });
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.VSMShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.info.autoReset = false;
    this.scene = new T.Scene();
    this.camera = new T.PerspectiveCamera(29, 1, 0.08, 95);
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.115;
    this.controls.minPolarAngle = 0.02;
    this.controls.maxPolarAngle = Math.PI * 0.481;
    this.controls.target.set(0, 0.35, 0);
    this.studio = makeStudio(this.scene, this.renderer);
    this.studio.light(false);
    this.paint = [2, 0, 1];
    this.yaw = 0;
    this.speed = 160;
    this.actual = 0;
    this.running = false;
    this.hasRun = false;
    this.revision = 0;
    this.frame = 0;
    this.disposed = false;
    this.disposables = new AbortController();
    const signal = this.disposables.signal;
    this.controls.addEventListener('change', () => this.request());
    this.controls.addEventListener('start', () => {
      this.cameraTween?.kill();
      this.events.camera('custom');
    });
    this.canvas.addEventListener('keydown', (e) => this.keys(e), { signal });
    this.canvas.addEventListener(
      'webglcontextlost',
      (e) => {
        e.preventDefault();
        this.events.failure('图形设备连接中断');
      },
      { signal },
    );
    document.addEventListener(
      'visibilitychange',
      () => {
        this.last = 0;
        this.request();
      },
      { signal },
    );
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
    this.preset('hero', true);
  }
  async init() {
    const env = await new HDRLoader().loadAsync(this.host.dataset.studio);
    if (this.disposed) {
      env.dispose();
      return;
    }
    env.mapping = T.EquirectangularReflectionMapping;
    this.env = env;
    this.scene.environment = env;
    this.scene.environmentRotation.y = 0.86;
    const livery = await new T.TextureLoader().loadAsync(this.host.dataset.livery);
    if (this.disposed) {
      livery.dispose();
      return;
    }
    livery.colorSpace = T.SRGBColorSpace;
    livery.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    this.livery = livery;
    await this.load(this.host.dataset.model, '');
  }
  async load(input, filename) {
    const id = ++this.revision;
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const gltf =
      typeof input === 'string'
        ? await loader.loadAsync(input)
        : await loader.parseAsync(input, '');
    if (this.disposed || id !== this.revision) {
      release(gltf.scene);
      return;
    }
    let vehicle;
    try {
      vehicle = collectVehicle(gltf, filename, this.livery);
    } catch (e) {
      release(gltf.scene);
      throw e;
    }
    this.dropCar();
    this.car = vehicle;
    this.studio.placeWheels(vehicle.wheels);
    this.scene.add(vehicle.group, vehicle.field.mesh);
    vehicle.finish(...this.paint);
    vehicle.field.setYaw(this.yaw);
    vehicle.field.mesh.visible = this.hasRun && this.actual > 0;
    this.renderer.shadowMap.needsUpdate = true;
    this.canvas.dataset.paintMeshes = vehicle.count;
    this.preset('hero', true);
    this.events.model(vehicle.model, vehicle.count, vehicle.section);
    this.request();
  }
  dropCar() {
    if (!this.car) return;
    const { group, field, sourceMaterials } = this.car;
    this.scene.remove(group, field.mesh);
    release(group, sourceMaterials);
    release(field.mesh);
    this.car = null;
  }
  resize() {
    if (this.disposed) return;
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    if (!w || !h) return;
    const ratio = this.fit ? this.camera.position.distanceTo(this.controls.target) / this.fit : 1;
    const span = Math.min(w * 0.65, h * 1.55);
    this.fit = (((h * 0.5) / Math.tan(T.MathUtils.degToRad(this.camera.fov / 2))) * 4.72) / span;
    this.controls.minDistance = this.fit * 0.67;
    this.controls.maxDistance = this.fit * 1.88;
    const eye = this.camera.position.clone().sub(this.controls.target).normalize();
    this.camera.position
      .copy(this.controls.target)
      .addScaledVector(eye, this.fit * T.MathUtils.clamp(ratio, 0.67, 1.88));
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.45));
    this.renderer.setSize(w, h, false);
    this.request();
  }
  preset(name, instant = false) {
    this.cameraTween?.kill();
    const target = this.controls.target;
    const dir = new T.Vector3(...directions[name]).normalize(),
      dest = new T.Spherical().setFromVector3(dir);
    const cur = new T.Spherical().setFromVector3(this.camera.position.clone().sub(target));
    const at = (r) => {
      this.camera.position.copy(target).add(new T.Vector3().setFromSpherical(r));
      this.controls.update();
      this.request();
    };
    const radius = this.fit * (name === 'top' ? 1.13 : name === 'side' ? 1.03 : 1);
    if (instant || reduced()) {
      dest.radius = radius;
      at(dest);
    } else
      this.cameraTween = gsap.to(cur, {
        radius,
        phi: dest.phi,
        theta: cur.theta + wrap(dest.theta - cur.theta),
        duration: 0.85,
        ease: 'power3.inOut',
        onUpdate: () => at(cur),
      });
    this.events.camera(name);
  }
  keys(e) {
    const orbit = new T.Spherical().setFromVector3(
      this.camera.position.clone().sub(this.controls.target),
    );
    if (e.key === 'Home') {
      e.preventDefault();
      this.preset('hero');
      return;
    }
    if (e.key === 'ArrowLeft') orbit.theta -= 0.12;
    else if (e.key === 'ArrowRight') orbit.theta += 0.12;
    else if (e.key === 'ArrowUp') orbit.phi -= 0.09;
    else if (e.key === 'ArrowDown') orbit.phi += 0.09;
    else if (e.key === '+' || e.key === '=') orbit.radius *= 0.91;
    else if (e.key === '-') orbit.radius *= 1.1;
    else return;
    e.preventDefault();
    this.cameraTween?.kill();
    orbit.phi = T.MathUtils.clamp(
      orbit.phi,
      this.controls.minPolarAngle,
      this.controls.maxPolarAngle,
    );
    orbit.radius = T.MathUtils.clamp(
      orbit.radius,
      this.controls.minDistance,
      this.controls.maxDistance,
    );
    this.camera.position.copy(this.controls.target).add(new T.Vector3().setFromSpherical(orbit));
    this.controls.update();
    this.events.camera('custom');
    this.request();
  }
  setPaint(from, to, t) {
    this.paint = [from, to, t];
    this.car?.finish(from, to, t);
    this.request();
  }
  light(dark) {
    this.studio.light(dark);
    this.request();
  }
  wind(speed, yaw, on) {
    if (yaw !== this.yaw) this.car?.field.setYaw(yaw);
    this.yaw = yaw;
    this.speed = speed;
    if (on && !this.hasRun) {
      this.actual = 0;
      this.hasRun = true;
    }
    this.running = on;
    if (on && reduced()) this.actual = speed;
    if (this.car) this.car.field.mesh.visible = this.hasRun && this.actual > 0;
    this.request();
  }
  resetWind() {
    this.running = this.hasRun = false;
    this.actual = 0;
    if (this.car) this.car.field.mesh.visible = false;
    this.request();
  }
  request() {
    if (this.disposed || this.frame || document.hidden) return;
    this.frame = requestAnimationFrame((time) => {
      this.frame = 0;
      const dt = this.last ? Math.min(0.09, (time - this.last) / 1000) : 0;
      this.last = time;
      this.controls.update();
      if (this.running && this.car) {
        const step = dt * 125;
        this.actual += T.MathUtils.clamp(this.speed - this.actual, -step, step);
        this.car.field.mesh.visible = this.actual > 0.1;
        this.car.field.advance(reduced() ? 0 : dt, this.actual);
        this.events.reading(this.actual);
      }
      this.renderer.info.reset();
      this.renderer.render(this.scene, this.camera);
      const stats = this.renderer.info.render;
      this.canvas.dataset.calls = stats.calls;
      this.canvas.dataset.triangles = stats.triangles;
      if (this.running && ((!reduced() && this.actual > 0) || this.actual !== this.speed))
        this.request();
    });
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.revision++;
    this.disposables.abort();
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.cameraTween?.kill();
    cancelAnimationFrame(this.frame);
    this.dropCar();
    this.studio.dispose();
    release(this.scene);
    this.env?.dispose();
    this.livery?.dispose();
    this.renderer.dispose();
  }
}
