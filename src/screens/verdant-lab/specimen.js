/* SPDX-License-Identifier: MIT */
import * as T from 'three';
import { createSpecimenModel } from './specimen-model.js';
import { materials, normalizedLeaf, opticalProfiles, platform } from './specimen-shaders.js';
import { makeBloom, samples } from './specimen-bloom.js';
import { paintPlate } from './specimen-flat.js';

function fruitHalos(model, uniforms) {
  const positions = [],
    uv = [],
    attrs = [],
    indices = [];
  model.fruits.forEach((f, i) => {
    const start = positions.length / 3;
    for (const [u, v] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      positions.push(f.top.x, f.top.y, f.top.z);
      uv.push(u, v);
      attrs.push(f.radius, i);
    }
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  });
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  g.setAttribute('berry', new T.Float32BufferAttribute(attrs, 2));
  g.setIndex(indices);
  const mat = new T.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
    vertexShader: `attribute vec2 berry; uniform float stage; varying vec2 offset; varying float id;
      void main(){offset=uv;id=berry.y;float r=berry.x*mix(.19,1.,smoothstep(0.,1.8,stage));
        vec4 p=modelViewMatrix*vec4(position-vec3(0.,r*.77,0.),1.);
        p.xy+=uv*r*vec2(1.76,1.57); gl_Position=projectionMatrix*p;}`,
    fragmentShader: `varying vec2 offset;varying float id;uniform float scan,featured;
      void main(){float r=length(offset);float around=exp(-pow((r-.54)*7.8,2.));
        float haze=around*(.10+.18*max(0.,offset.y-offset.x))+.05*exp(-r*r*3.);
        vec3 c=mix(vec3(.12,.74,.96),vec3(1.,.20,.13),1.-step(.4,abs(id-featured)));
        gl_FragColor=vec4(c,haze*scan*(1.-smoothstep(.75,1.,r)));}`,
  });
  return new T.Mesh(g, mat);
}
export function mountSpecimen(
  host,
  { leafUrl, scanLeafUrl, onPick = () => {}, onPlay = () => {} } = {},
) {
  const meshCanvas = document.createElement('canvas'),
    flat = document.createElement('canvas');
  for (const c of [meshCanvas, flat]) {
    c.setAttribute('aria-hidden', 'true');
    Object.assign(c.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      display: 'block',
      pointerEvents: 'none',
    });
    host.append(c);
  }
  host.tabIndex = 0;
  if (!host.hasAttribute('aria-label'))
    host.setAttribute('aria-label', '番茄植株，可拖动旋转，点击果实检查，按空格暂停');
  host.style.touchAction = 'pan-y';
  const model = createSpecimenModel(),
    scene = new T.Scene(),
    plant = new T.Group();
  scene.add(plant);
  const neutral = new T.DataTexture(new Uint8Array([65, 102, 49, 255]), 1, 1);
  neutral.needsUpdate = true;
  const U = {
    clock: { value: 0.72 },
    stage: { value: 2 },
    scan: { value: 1 },
    plot: { value: 0 },
    picked: { value: -1 },
    featured: { value: model.fruits.length - 1 },
    signalAt: { value: -100 },
    leafMap: { value: neutral },
    mapped: { value: 0 },
    opticalReady: { value: 0 },
    opticalMap: { value: neutral },
  };
  const mat = materials(U);
  for (const kind of Object.keys(mat)) plant.add(new T.Mesh(model[kind], mat[kind]));
  plant.add(fruitHalos(model, U), samples(U));
  scene.add(platform(U));
  let renderer = null,
    lost = false,
    disposed = false,
    frame = 0,
    last = 0,
    visible = true,
    drag = null;
  try {
    renderer = new T.WebGLRenderer({
      canvas: meshCanvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setClearColor(0, 0);
    renderer.info.autoReset = false;
  } catch {
    renderer = null;
  }
  const bloom = renderer ? makeBloom(renderer) : null;
  const camera = new T.OrthographicCamera(-4, 4, 3, -3, 0.1, 50);
  const center = new T.Vector3(0, 2.54, 0),
    projected = new T.Vector3();
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let playing = !motion.matches;
  let width = 1,
    height = 1,
    span = 6,
    zoom = 1,
    turn = 0,
    pitch = 0.082,
    targetScan = 1,
    targetStage = 2;
  const abort = new AbortController(),
    listen = { signal: abort.signal };
  const isGPU = () => Boolean(renderer && !lost);
  const project = (p) => {
    projected.copy(p).applyMatrix4(plant.matrixWorld).project(camera);
    return {
      x: ((projected.x + 1) * width) / 2,
      y: ((1 - projected.y) * height) / 2,
      z: projected.z,
    };
  };
  function pose() {
    const aspect = width / height;
    span = Math.max(5.91, 6.45 / aspect) / zoom;
    camera.left = (-span * aspect) / 2;
    camera.right = -camera.left;
    camera.top = span / 2;
    camera.bottom = -camera.top;
    camera.position.set(0, center.y + 12 * Math.sin(pitch), 12 * Math.cos(pitch));
    camera.lookAt(center);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    plant.rotation.y = turn;
    plant.updateMatrixWorld(true);
    host.dataset.yaw = turn.toFixed(3);
  }
  function setStatus() {
    const gpu = isGPU();
    meshCanvas.style.display = gpu ? 'block' : 'none';
    flat.style.display = gpu ? 'none' : 'block';
    host.dataset.renderer = gpu ? 'webgl2' : 'canvas2d';
    host.dataset.playing = String(playing);
    onPlay(playing, gpu);
  }
  function draw() {
    if (disposed) return;
    if (isGPU()) {
      renderer.info.reset();
      bloom.render(scene, camera, U.scan.value);
      host.dataset.calls = String(renderer.info.render.calls);
    } else {
      const ctx = flat.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(flat.width / width, 0, 0, flat.height / height, 0, 0);
      paintPlate(ctx, model, project, {
        width,
        height,
        scan: U.scan.value > 0.5,
        stage: U.stage.value,
        scale: height / span,
        clock: U.clock.value,
        picked: U.picked.value,
        optical: U.opticalReady.value ? U.opticalMap.value.image : null,
        growth: 0.19 + 0.81 * T.MathUtils.smoothstep(U.stage.value, 0, 1.8),
      });
    }
  }
  function tick(now) {
    frame = 0;
    if (disposed || document.hidden || !visible) return;
    if (!isGPU() && last && playing && now - last < 68) {
      queue();
      return;
    }
    const dt = last ? Math.min((now - last) / 1000, 0.12) : 0;
    last = now;
    if (playing) {
      U.clock.value += dt;
      U.scan.value = T.MathUtils.damp(U.scan.value, targetScan, 8, dt);
      U.stage.value = T.MathUtils.damp(U.stage.value, targetStage, 7, dt);
    }
    draw();
    if (playing) queue();
  }
  function queue() {
    if (!frame && !disposed && !document.hidden && visible) frame = requestAnimationFrame(tick);
  }
  function sync() {
    if (document.hidden || !visible) {
      cancelAnimationFrame(frame);
      frame = 0;
      last = 0;
    } else queue();
  }
  function size() {
    width = host.clientWidth;
    height = host.clientHeight;
    if (!width || !height) return;
    const dpr = Math.min(devicePixelRatio || 1, 1.8, Math.sqrt(1500000 / (width * height)));
    if (isGPU()) {
      renderer.setPixelRatio(dpr);
      renderer.setSize(width, height, false);
      bloom.resize(meshCanvas.width, meshCanvas.height);
    }
    if (flat.width !== Math.round(width * dpr)) flat.width = Math.round(width * dpr);
    if (flat.height !== Math.round(height * dpr)) flat.height = Math.round(height * dpr);
    pose();
    queue();
  }
  function play(v) {
    playing = v;
    last = 0;
    if (!v) {
      U.scan.value = targetScan;
      U.stage.value = targetStage;
    }
    setStatus();
    queue();
  }
  function reset() {
    turn = 0;
    pitch = 0.082;
    zoom = 1;
    pose();
    queue();
  }
  function pick(x, y) {
    const bounds = host.getBoundingClientRect(),
      growth = 0.19 + 0.81 * T.MathUtils.smoothstep(U.stage.value, 0, 1.8);
    let best = -1,
      depth = Infinity;
    model.fruits.forEach((f, id) => {
      const point = f.center.clone().sub(f.top).multiplyScalar(growth).add(f.top);
      const p = project(point),
        dx = x - bounds.left - p.x,
        dy = y - bounds.top - p.y,
        r = (f.radius * growth * height) / span;
      if (dx * dx + (dy * dy) / 0.81 <= Math.max(7, r) ** 2 && p.z < depth) {
        best = id;
        depth = p.z;
      }
    });
    if (best >= 0) inspectFruit(best);
  }
  function inspectFruit(index) {
    U.picked.value = index;
    U.signalAt.value = U.clock.value;
    host.dataset.fruit = String(index);
    onPick(index);
    queue();
  }
  host.addEventListener(
    'pointerdown',
    (e) => {
      if (e.button !== 0 || !e.isPrimary) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, turn, pitch, moved: false };
      host.setPointerCapture(e.pointerId);
    },
    listen,
  );
  host.addEventListener(
    'pointermove',
    (e) => {
      if (!drag || drag.id !== e.pointerId) return;
      const x = e.clientX - drag.x,
        y = e.clientY - drag.y;
      drag.moved ||= Math.hypot(x, y) > 5;
      if (!drag.moved) return;
      turn = drag.turn + x * 0.008;
      pitch = T.MathUtils.clamp(drag.pitch + y * 0.003, -0.12, 0.52);
      pose();
      queue();
    },
    listen,
  );
  host.addEventListener(
    'pointerup',
    (e) => {
      if (drag?.id === e.pointerId && !drag.moved) pick(e.clientX, e.clientY);
      drag = null;
    },
    listen,
  );
  host.addEventListener(
    'lostpointercapture',
    () => {
      drag = null;
    },
    listen,
  );
  host.addEventListener(
    'wheel',
    (e) => {
      if (width < 460 && !e.ctrlKey) return;
      e.preventDefault();
      zoom = T.MathUtils.clamp(zoom * Math.exp(-e.deltaY * 0.0009), 0.77, 1.75);
      pose();
      queue();
    },
    { ...listen, passive: false },
  );
  host.addEventListener(
    'keydown',
    (e) => {
      if (e.target !== host) return;
      switch (e.key) {
        case ' ':
          play(!playing);
          break;
        case 'Home':
          reset();
          break;
        case 'ArrowLeft':
          turn -= 0.13;
          break;
        case 'ArrowRight':
          turn += 0.13;
          break;
        case 'ArrowUp':
          pitch = Math.min(0.52, pitch + 0.06);
          break;
        case 'ArrowDown':
          pitch = Math.max(-0.12, pitch - 0.06);
          break;
        case '+':
        case '=':
          zoom = Math.min(1.75, zoom * 1.1);
          break;
        case '-':
          zoom = Math.max(0.77, zoom / 1.1);
          break;
        case 'Enter':
          inspectFruit(U.featured.value);
          break;
        default:
          return;
      }
      e.preventDefault();
      pose();
      queue();
    },
    listen,
  );
  motion.addEventListener('change', (e) => play(!e.matches), listen);
  document.addEventListener('visibilitychange', sync, listen);
  meshCanvas.addEventListener(
    'webglcontextlost',
    (e) => {
      e.preventDefault();
      lost = true;
      setStatus();
      size();
    },
    listen,
  );
  meshCanvas.addEventListener(
    'webglcontextrestored',
    () => {
      lost = false;
      setStatus();
      size();
    },
    listen,
  );
  const resizer = new ResizeObserver(size);
  resizer.observe(host);
  const viewport = new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    sync();
  });
  viewport.observe(host);
  if (scanLeafUrl) {
    const image = new Image();
    image.addEventListener(
      'load',
      () => {
        if (disposed) return;
        const profiles = opticalProfiles(image);
        const previous = model.leaf,
          mesh = plant.children.find((c) => c.geometry === previous);
        model.leaf = model.buildBlades(profiles);
        mesh.geometry = model.leaf;
        previous.dispose();
        const texture = new T.Texture(image);
        texture.needsUpdate = true;
        U.opticalMap.value = texture;
        U.opticalReady.value = 1;
        host.dataset.scanTexture = 'ready';
        queue();
      },
      listen,
    );
    image.src = scanLeafUrl;
  }
  if (leafUrl) {
    const image = new Image();
    image.addEventListener(
      'load',
      () => {
        if (disposed) return;
        const texture = normalizedLeaf(image);
        texture.needsUpdate = true;
        U.leafMap.value = texture;
        U.mapped.value = 1;
        host.dataset.texture = 'ready';
        queue();
      },
      listen,
    );
    image.src = leafUrl;
  }
  host.dataset.mode = 'scan';
  host.dataset.stage = '2';
  setStatus();
  size();
  return {
    select(stage, plot) {
      targetStage = T.MathUtils.clamp(Number(stage), 0, 2);
      U.plot.value = Number(plot);
      if (!playing) U.stage.value = targetStage;
      U.picked.value = -1;
      delete host.dataset.fruit;
      host.dataset.stage = String(stage);
      host.dataset.plot = String(plot);
      queue();
    },
    setMode(mode) {
      targetScan = mode === 'scan' ? 1 : 0;
      if (!playing) U.scan.value = targetScan;
      host.dataset.mode = mode;
      queue();
    },
    toggle() {
      play(!playing);
    },
    reset,
    dispose() {
      if (disposed) return;
      disposed = true;
      abort.abort();
      cancelAnimationFrame(frame);
      resizer.disconnect();
      viewport.disconnect();
      scene.traverse((obj) => {
        if (obj.geometry && obj.material) {
          obj.geometry.dispose();
          obj.material.dispose();
        }
      });
      if (U.leafMap.value !== neutral) U.leafMap.value.dispose();
      if (U.opticalMap.value !== neutral) U.opticalMap.value.dispose();
      neutral.dispose();
      bloom?.dispose();
      renderer?.dispose();
      meshCanvas.remove();
      flat.remove();
    },
  };
}
