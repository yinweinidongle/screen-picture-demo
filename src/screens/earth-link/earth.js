/* SPDX-License-Identifier: MIT */
import { gsap } from 'gsap';
import {
  BufferGeometry,
  Curve,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  MathUtils,
  Mesh,
  MeshBasicNodeMaterial,
  NoColorSpace,
  PerspectiveCamera,
  RepeatWrapping,
  RingGeometry,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  WebGPURenderer,
} from 'three/webgpu';
import { uniform } from 'three/tsl';
import { links, stations } from './data.js';
import { earthMaterials, linkMaterial } from './materials.js';

const { clamp, degToRad, euclideanModulo } = MathUtils;
const initialView = { latitude: 23, longitude: 99, distance: 3.78 };
const lightAngles = { day: -12, terminator: -65, night: -165 };
const wrapLongitude = (value) => euclideanModulo(value + 180, 360) - 180;

function stationDirection({ latitude, longitude }) {
  const lat = degToRad(latitude);
  const lon = degToRad(longitude);
  // SphereGeometry's u = 0 seam maps to 180°W in the equirectangular textures.
  return new Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon));
}

class RelayArc extends Curve {
  constructor(from, to) {
    super();
    this.from = from;
    this.to = to;
    this.angle = from.angleTo(to);
    this.sine = Math.sin(this.angle);
  }

  getPoint(t, point = new Vector3()) {
    const lift = Math.min(0.17, 0.046 + this.angle * 0.062) * Math.pow(Math.sin(Math.PI * t), 1.15);
    return point
      .copy(this.from)
      .multiplyScalar(Math.sin((1 - t) * this.angle) / this.sine)
      .addScaledVector(this.to, Math.sin(t * this.angle) / this.sine)
      .multiplyScalar(1.012 + lift);
  }
}

function linkRibbon(curve) {
  const positions = [],
    tangents = [],
    uvs = [],
    indices = [];
  const segments = 80;
  const point = new Vector3();
  const tangent = new Vector3();
  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    curve.getPointAt(u, point);
    curve.getTangentAt(u, tangent);
    for (const side of [0, 1]) {
      positions.push(point.x, point.y, point.z);
      tangents.push(tangent.x, tangent.y, tangent.z);
      uvs.push(u, side);
    }
    if (i < segments) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('arcTangent', new Float32BufferAttribute(tangents, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

export function createEarthScene(
  host,
  canvas,
  labels,
  { onStationClick, onViewChange, onRenderer },
) {
  const scene = new Scene();
  const planet = new Group();
  const routeLayer = new Group();
  const camera = new PerspectiveCamera(37, 1, 0.1, 20);
  const sunlight = new DirectionalLight('#fff2e1', 2.85);
  scene.add(planet, sunlight, new HemisphereLight('#c2ddf0', '#254561', 0.7));
  planet.add(routeLayer);

  const view = { ...initialView };
  const light = { angle: lightAngles.terminator };
  const sunDirection = uniform(new Vector3());
  const flightTime = uniform(0);
  const clock = { progress: 0 };
  const cloudOffset = uniform(0);
  const controller = new AbortController();
  const listener = { signal: controller.signal };
  const resources = new Set();
  const markers = new Map();
  const relays = [];
  const world = new Vector3();
  const projected = new Vector3();
  let renderer, pulse, orbitTween, viewTween, lightTween, drag;
  let activeStation = stations[0].code;
  let orbitOnReady = true;
  let frame = 0;
  let initialized = false;
  let ready = false;
  let disposed = false;
  let playing = true;
  let reduceMotion = false;

  const cycle = gsap.to(clock, {
    progress: 1,
    duration: 12,
    ease: 'none',
    repeat: -1,
    paused: true,
    onUpdate: requestRender,
  });

  function track(resource) {
    resources.add(resource);
    return resource;
  }

  function loadTextures() {
    const loader = new TextureLoader();
    return Promise.all(
      ['day', 'night', 'normal', 'clouds'].map(
        (key) =>
          new Promise((resolve, reject) => {
            const map = track(
              loader.load(host.dataset[key], resolve, undefined, () => {
                reject(new Error('Could not load the Earth ' + key + ' texture'));
              }),
            );
            map.colorSpace = key === 'day' || key === 'night' ? SRGBColorSpace : NoColorSpace;
            map.wrapS = RepeatWrapping;
            map.anisotropy = Math.min(4, renderer.getMaxAnisotropy());
          }),
      ),
    );
  }

  function buildEarth(textures) {
    const { surface, atmosphere } = earthMaterials(textures, sunDirection, cloudOffset);
    const sphere = track(new SphereGeometry(1, 96, 64));
    const air = new Mesh(sphere, track(atmosphere));
    air.scale.setScalar(1.034);
    planet.add(new Mesh(sphere, track(surface)), air);

    const dot = track(new SphereGeometry(0.012, 10, 7));
    const ring = track(new RingGeometry(0.017, 0.022, 28));
    const idle = track(new MeshBasicNodeMaterial({ color: '#91f3e8' }));
    const active = track(new MeshBasicNodeMaterial({ color: '#ffe0a5' }));
    pulse = new Mesh(
      ring,
      track(
        new MeshBasicNodeMaterial({
          color: '#ffc881',
          transparent: true,
          depthWrite: false,
        }),
      ),
    );
    const forward = new Vector3(0, 0, 1);
    for (const station of stations) {
      const direction = stationDirection(station);
      const anchor = new Group();
      anchor.position.copy(direction).multiplyScalar(1.013);
      anchor.quaternion.setFromUnitVectors(forward, direction);
      const core = new Mesh(dot, idle);
      const outline = new Mesh(ring, idle);
      anchor.add(core, outline);
      planet.add(anchor);
      markers.set(station.code, {
        station,
        direction,
        anchor,
        core,
        outline,
        idle,
        active,
        label: labels.get(station.code),
      });
    }
    links.forEach(({ from, to }, index) => {
      const curve = new RelayArc(markers.get(from).direction, markers.get(to).direction);
      const { material, highlighted } = linkMaterial(flightTime, curve.getLength(), index);
      const trail = new Mesh(track(linkRibbon(curve)), track(material));
      trail.renderOrder = 2;
      routeLayer.add(trail);
      relays.push({ from, to, highlighted });
    });
    refreshSelection();
  }

  function refreshSelection() {
    for (const [code, marker] of markers) {
      marker.core.material = marker.outline.material =
        code === activeStation ? marker.active : marker.idle;
    }
    markers.get(activeStation)?.anchor.add(pulse);
    for (const relay of relays) {
      relay.highlighted.value = Number(relay.from === activeStation || relay.to === activeStation);
    }
  }

  function placeLabels() {
    const width = host.clientWidth;
    const height = host.clientHeight;
    for (const marker of markers.values()) {
      marker.anchor.getWorldPosition(world);
      // Dot product of the surface normal and the direction to the camera.
      marker.label.hidden = world.dot(camera.position) - world.lengthSq() < 0.14;
      if (marker.label.hidden) continue;
      projected.copy(world).project(camera);
      marker.x = (projected.x * 0.5 + 0.5) * width;
      marker.y = (0.5 - projected.y * 0.5) * height;
      marker.label.style.left = marker.x + 'px';
      marker.label.style.top = marker.y + 'px';
    }
  }

  function render() {
    flightTime.value = cycle.totalTime();
    cloudOffset.value = (flightTime.value / 1300) % 1;
    planet.rotation.set(degToRad(view.latitude), degToRad(-90 - view.longitude), 0);
    camera.position.z = view.distance;
    const angle = degToRad(light.angle);
    sunDirection.value.set(Math.sin(angle), 0.37, Math.cos(angle)).normalize();
    sunlight.position.copy(sunDirection.value);

    const wave = (clock.progress * 6) % 1;
    pulse.scale.setScalar(1 + wave * 1.85);
    pulse.material.opacity = 0.85 * (1 - wave);

    renderer.render(scene, camera);
    placeLabels();
    onViewChange(view.latitude, wrapLongitude(view.longitude));
  }

  function requestRender() {
    if (!ready || disposed || document.hidden || frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      try {
        render();
      } catch (error) {
        fallback(error);
      }
    });
  }

  function resize() {
    if (!ready || disposed) return;
    const width = host.clientWidth;
    const height = host.clientHeight;
    const scale = host.getBoundingClientRect().width / width;
    renderer.setPixelRatio(clamp(scale * devicePixelRatio, 0.15, 1.5));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    requestRender();
  }

  function syncMotion() {
    const paused = !ready || disposed || !playing || document.hidden;
    cycle.paused(paused);
    orbitTween?.paused(paused);
    requestRender();
  }

  function startOrbit() {
    orbitTween = gsap.to(view, {
      longitude: view.longitude + 360,
      duration: 190,
      ease: 'none',
      repeat: -1,
      paused: true,
      onUpdate: requestRender,
    });
    syncMotion();
  }

  function stopViewTweens() {
    orbitTween?.kill();
    viewTween?.kill();
    orbitTween = viewTween = null;
  }

  function focusView(target, onComplete) {
    stopViewTweens();
    const values = {
      ...target,
      longitude: view.longitude + wrapLongitude(target.longitude - view.longitude),
    };
    if (reduceMotion) {
      Object.assign(view, values);
      requestRender();
      onComplete?.();
    } else {
      viewTween = gsap.to(view, {
        ...values,
        duration: 0.95,
        ease: 'power3.inOut',
        onUpdate: requestRender,
        onComplete,
      });
    }
  }

  function selectStation(station, focus) {
    if (disposed) return;
    activeStation = station.code;
    if (!ready) {
      if (focus) {
        view.latitude = station.latitude;
        view.longitude = station.longitude;
        orbitOnReady = false;
      }
      return;
    }
    refreshSelection();
    if (focus) focusView({ latitude: station.latitude, longitude: station.longitude });
    requestRender();
  }

  function setLighting(mode) {
    if (!ready || disposed) return;
    lightTween?.kill();
    if (reduceMotion) {
      light.angle = lightAngles[mode];
      requestRender();
    } else {
      lightTween = gsap.to(light, {
        angle: lightAngles[mode],
        duration: 1.25,
        ease: 'power2.inOut',
        onUpdate: requestRender,
      });
    }
  }

  function setMotion(active, reduced) {
    if (disposed) return;
    playing = active;
    reduceMotion = reduced;
    if (reduced) {
      viewTween?.progress(1);
      lightTween?.progress(1);
    }
    syncMotion();
  }

  function rotate(latitude, longitude) {
    stopViewTweens();
    view.latitude = clamp(view.latitude + latitude, -80, 80);
    view.longitude = wrapLongitude(view.longitude + longitude);
    requestRender();
  }

  function zoom(delta) {
    viewTween?.kill();
    viewTween = null;
    view.distance = clamp(view.distance + delta, 3.26, 6.1);
    requestRender();
  }

  function selectAt(event) {
    const bounds = canvas.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) * host.clientWidth) / bounds.width;
    const y = ((event.clientY - bounds.top) * host.clientHeight) / bounds.height;
    let closest;
    let limit = 29;
    for (const marker of markers.values()) {
      if (marker.label.hidden) continue;
      const distance = Math.hypot(x - marker.x, y - marker.y);
      if (distance < limit) {
        closest = marker;
        limit = distance;
      }
    }
    if (closest) onStationClick(closest.station);
  }

  canvas.addEventListener(
    'pointerdown',
    (event) => {
      if (!ready || drag || event.button !== 0) return;
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
      canvas.setPointerCapture(drag.id);
    },
    listener,
  );
  canvas.addEventListener(
    'pointermove',
    (event) => {
      if (drag?.id !== event.pointerId) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 4) return;
      drag = { ...drag, x: event.clientX, y: event.clientY, moved: true };
      const factor = 138 / canvas.getBoundingClientRect().height;
      rotate(dy * factor, -dx * factor);
    },
    listener,
  );
  canvas.addEventListener(
    'pointerup',
    (event) => {
      if (drag?.id !== event.pointerId) return;
      if (!drag.moved) selectAt(event);
      drag = null;
    },
    listener,
  );
  canvas.addEventListener(
    'lostpointercapture',
    (event) => {
      if (drag?.id === event.pointerId) drag = null;
    },
    listener,
  );
  canvas.addEventListener(
    'wheel',
    (event) => {
      if (!ready) return;
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : 1;
      zoom(clamp(event.deltaY * unit * 0.003, -0.35, 0.35));
    },
    { ...listener, passive: false },
  );
  const arrows = { ArrowUp: [8, 0], ArrowDown: [-8, 0], ArrowLeft: [0, -8], ArrowRight: [0, 8] };
  canvas.addEventListener(
    'keydown',
    (event) => {
      if (!ready) return;
      if (arrows[event.key]) rotate(...arrows[event.key]);
      else if (event.key === '+' || event.key === '=') zoom(-0.3);
      else if (event.key === '-') zoom(0.3);
      else return;
      event.preventDefault();
    },
    listener,
  );
  document.addEventListener('visibilitychange', syncMotion, listener);

  function releaseRenderer() {
    renderer
      .dispose()
      .catch((error) => console.warn('Could not release the Earth renderer', error));
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    controller.abort();
    cancelAnimationFrame(frame);
    cycle.kill();
    stopViewTweens();
    lightTween?.kill();
    for (const resource of resources) resource.dispose();
    if (initialized) releaseRenderer();
  }

  function fallback(error) {
    if (disposed) return;
    if (error) console.warn('Earth scene unavailable', error);
    dispose();
    onRenderer('fallback');
  }

  async function initialize() {
    try {
      renderer = new WebGPURenderer({
        canvas,
        antialias: true,
        alpha: true,
        forceWebGL: !navigator.gpu,
      });
      renderer.onDeviceLost = () => fallback();
      await renderer.init();
      initialized = true;
      if (disposed) {
        releaseRenderer();
        return;
      }
      const textures = await loadTextures();
      if (disposed) return;
      buildEarth(textures);
      ready = true;
      resize();
      render();
      canvas.dataset.drawCalls = renderer.info.render.drawCalls;
      canvas.dataset.triangles = renderer.info.render.triangles;
      onRenderer(renderer.backend.isWebGPUBackend ? 'webgpu' : 'webgl2');
      if (orbitOnReady) startOrbit();
      else syncMotion();
    } catch (error) {
      fallback(error);
    }
  }

  initialize();
  return {
    resize,
    dispose,
    selectStation,
    setLighting,
    setMotion,
    setLinksVisible(visible) {
      routeLayer.visible = visible;
      requestRender();
    },
    resetView() {
      if (ready && !disposed) focusView(initialView, startOrbit);
    },
  };
}
