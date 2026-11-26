/* SPDX-License-Identifier: MIT */
import * as T from 'three';
import { civicCanopy } from './canopy.js';
import { sceneObjects } from './materials.js';
import { services } from './data.js';

function flatView(canvas, model) {
  const ctx = canvas.getContext('2d'),
    projected = new T.Vector3();
  const lines = model.branches.map((b) =>
    b.curve.getSpacedPoints(Math.max(7, Math.ceil(b.length * 9))),
  );
  return (camera, w, h, dpr, focus, time) => {
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const project = (v) => projected.copy(v).project(camera);
    const x = () => w * (0.5 + projected.x * 0.5),
      y = () => h * (0.5 - projected.y * 0.5);
    const unit = h / (camera.top - camera.bottom);
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#4bcad6';
    ctx.globalAlpha = 0.47;
    for (const r of [2.46, 2.61, 2.88]) {
      ctx.beginPath();
      for (let k = 0; k <= 96; k++) {
        const a = (k * Math.PI) / 48;
        projected.set(r * Math.cos(a), -0.035, r * Math.sin(a)).project(camera);
        if (k) ctx.lineTo(x(), y());
        else ctx.moveTo(x(), y());
      }
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
    model.branches.forEach((b, i) => {
      const selected = focus < 0 || b.sector < 0 || b.sector === focus;
      const points = lines[i];
      project(points[0]);
      let sx = x(),
        sy = y();
      for (let k = 1; k < points.length; k++) {
        project(points[k]);
        const ex = x(),
          ey = y(),
          t = k / (points.length - 1);
        const radius = (b.tip + (b.radius - b.tip) * (1 - t) ** 0.8) * unit;
        const pulse = 0.5 + 0.5 * Math.cos((b.start + t * b.length - time * 1.42) * 0.7);
        ctx.strokeStyle = b.sector < 0 ? '#63cfe6' : services[b.sector].color;
        ctx.globalAlpha = (selected ? 0.73 : 0.19) * (0.66 + 0.34 * pulse);
        ctx.lineWidth = Math.max(0.55, radius * 1.9);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        if (radius > 2) {
          ctx.strokeStyle = '#bef6fe';
          ctx.lineWidth = radius * 0.26;
          ctx.stroke();
        }
        sx = ex;
        sy = ey;
      }
    });
    for (let i = 0; i < model.stars.length; i += 3) {
      const [px, py, pz, g, , size, seed, tip] = model.stars[i];
      projected.set(px, py, pz).project(camera);
      ctx.fillStyle = seed > 0.9 ? '#ffd59a' : g < 0 ? '#79dfed' : services[g].color;
      ctx.globalAlpha = (focus < 0 || g < 0 || focus === g ? 0.72 : 0.2) * (0.53 + 0.47 * seed);
      const s = Math.max(0.65, size * unit * 0.022) * (tip ? 1.65 : 1);
      ctx.fillRect(x() - s / 2, y() - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  };
}

export function mountCanopy(host, pins, onPlay) {
  const canvas = host.querySelector('.spatial'),
    fallback = host.querySelector('.flat');
  const model = civicCanopy(),
    scene = new T.Scene(),
    camera = new T.OrthographicCamera(-5, 5, 4, -4, 0.1, 75);
  const uniforms = {
    clock: { value: 2.15 },
    focus: { value: -1 },
    launch: { value: -90 },
    load: { value: new T.Vector4(0.76, 0.85, 0.62, 0.74) },
    resolutionScale: { value: 1 },
    worldScale: { value: 1 },
  };
  const opts = {
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
  };
  let renderer;
  try {
    const context = canvas.getContext('webgl2', opts);
    if (context) renderer = new T.WebGLRenderer({ canvas, context, ...opts });
  } catch {
    /* The projected canvas uses the same skeleton and selection. */
  }
  const objects = renderer ? Object.values(sceneObjects(model, uniforms)) : [];
  if (renderer) {
    renderer.setClearColor(0x000000, 0);
    scene.add(...objects);
  }
  let drawFlat,
    lost = false,
    visible = true,
    disposed = false,
    frame = 0,
    last = 0;
  let w = 1,
    h = 1,
    dpr = 1,
    yaw = 0,
    pitch = 0.195,
    zoom = 1,
    drag;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let playing = !motion.matches;
  const abort = new AbortController(),
    listen = { signal: abort.signal };
  const look = new T.Vector3(0, 3.24, 0),
    pv = new T.Vector3();
  function status() {
    const gpu = Boolean(renderer && !lost);
    host.dataset.renderer = gpu ? 'webgl2' : 'canvas2d';
    host.dataset.playing = String(playing);
    canvas.hidden = !gpu;
    fallback.hidden = gpu;
    if (!gpu) drawFlat ??= flatView(fallback, model);
    onPlay(playing, gpu);
  }
  function invalidate() {
    if (!frame && !disposed && visible && !document.hidden) frame = requestAnimationFrame(render);
  }
  function pose() {
    const aspect = w / h,
      span = Math.max(7.98, 11.9 / aspect) / zoom;
    camera.left = (-span * aspect) / 2;
    camera.right = -camera.left;
    camera.top = span / 2;
    camera.bottom = -camera.top;
    camera.position.set(
      16 * Math.sin(yaw) * Math.cos(pitch),
      look.y + 16 * Math.sin(pitch),
      16 * Math.cos(yaw) * Math.cos(pitch),
    );
    camera.lookAt(look);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    uniforms.resolutionScale.value = dpr * Math.min(1.8, Math.max(0.72, h / 415)) * zoom;
    uniforms.worldScale.value = (dpr * h) / span;
    model.anchors.forEach((anchor, i) => {
      pv.copy(anchor).project(camera);
      const side = pv.x < 0 ? 'left' : 'right',
        sign = side === 'left' ? -1 : 1;
      const left = (0.5 + 0.5 * pv.x) * w,
        top = (0.5 - 0.5 * pv.y) * h;
      const pin = pins[i];
      pin.dataset.side = side;
      pin.style.left =
        Math.max(
          side === 'left' ? 83 : 4,
          Math.min(w - (side === 'right' ? 83 : 4), left + sign * 6),
        ) + 'px';
      pin.style.top = Math.max(9, Math.min(h - 30, top - 6)) + 'px';
    });
    host.dataset.yaw = yaw.toFixed(3);
  }
  function size() {
    w = host.clientWidth;
    h = host.clientHeight;
    if (!w || !h) return;
    dpr = Math.min(devicePixelRatio || 1, 1.65, Math.sqrt(1600000 / (w * h)));
    if (renderer && !lost) {
      if (renderer.getPixelRatio() !== dpr) renderer.setPixelRatio(dpr);
      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr))
        renderer.setSize(w, h, false);
    }
    if (fallback.width !== Math.round(w * dpr)) fallback.width = Math.round(w * dpr);
    if (fallback.height !== Math.round(h * dpr)) fallback.height = Math.round(h * dpr);
    pose();
    if (!playing && visible && !document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
      render(performance.now());
    } else invalidate();
  }
  function render(now) {
    frame = 0;
    if (!visible || document.hidden || disposed) return;
    const gpu = renderer && !lost;
    if (!gpu && playing && last && now - last < 60) {
      invalidate();
      return;
    }
    if (playing && last) uniforms.clock.value += Math.min(0.14, (now - last) / 1000);
    last = now;
    if (gpu) {
      renderer.render(scene, camera);
      if (!host.dataset.calls) {
        host.dataset.calls = String(renderer.info.render.calls);
        host.dataset.triangles = String(renderer.info.render.triangles);
      }
    } else drawFlat(camera, w, h, dpr, uniforms.focus.value, uniforms.clock.value);
    if (playing) invalidate();
  }
  function play(value) {
    playing = value;
    last = 0;
    status();
    invalidate();
  }
  function reset() {
    yaw = 0;
    pitch = 0.195;
    zoom = 1;
    pose();
    invalidate();
  }
  function inspect(dx, dy) {
    yaw = T.MathUtils.clamp(yaw + dx, -1.16, 1.16);
    pitch = T.MathUtils.clamp(pitch + dy, 0.08, 0.48);
    pose();
    invalidate();
  }
  function rescale(factor) {
    zoom = T.MathUtils.clamp(zoom * factor, 0.84, 1.23);
    pose();
    invalidate();
  }
  host.addEventListener(
    'pointerdown',
    (e) => {
      if (e.button !== 0 || e.target.closest('button')) return;
      host.focus({ preventScroll: true });
      drag = [e.clientX, e.clientY];
      host.setPointerCapture(e.pointerId);
      host.classList.add('dragging');
    },
    listen,
  );
  host.addEventListener(
    'pointermove',
    (e) => {
      if (!drag || !host.hasPointerCapture(e.pointerId)) return;
      inspect((drag[0] - e.clientX) * 0.006, (e.clientY - drag[1]) * 0.003);
      drag = [e.clientX, e.clientY];
    },
    listen,
  );
  host.addEventListener(
    'lostpointercapture',
    () => {
      drag = null;
      host.classList.remove('dragging');
    },
    listen,
  );
  host.addEventListener(
    'wheel',
    (e) => {
      // Leave vertical page scrolling available on compact layouts.
      if (w < 460 && !e.ctrlKey) return;
      e.preventDefault();
      rescale(Math.exp(-e.deltaY * 0.001));
    },
    { ...listen, passive: false },
  );
  host.addEventListener(
    'keydown',
    (e) => {
      if (e.target !== host) return;
      switch (e.key) {
        case 'ArrowLeft':
          inspect(-0.13, 0);
          break;
        case 'ArrowRight':
          inspect(0.13, 0);
          break;
        case 'ArrowUp':
          inspect(0, 0.07);
          break;
        case 'ArrowDown':
          inspect(0, -0.07);
          break;
        case '+':
        case '=':
          rescale(1.1);
          break;
        case '-':
          rescale(1 / 1.1);
          break;
        case 'Home':
          reset();
          break;
        case ' ':
          play(!playing);
          break;
        default:
          return;
      }
      e.preventDefault();
    },
    listen,
  );
  motion.addEventListener('change', (e) => play(!e.matches), listen);
  function visibility() {
    last = 0;
    if (!visible || document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
    } else invalidate();
  }
  document.addEventListener('visibilitychange', visibility, listen);
  canvas.addEventListener(
    'webglcontextlost',
    (e) => {
      e.preventDefault();
      lost = true;
      status();
      size();
    },
    listen,
  );
  canvas.addEventListener(
    'webglcontextrestored',
    () => {
      lost = false;
      status();
      size();
    },
    listen,
  );
  const observer = new ResizeObserver(size);
  observer.observe(host);
  const viewport = new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    visibility();
  });
  viewport.observe(host);
  status();
  size();
  return {
    toggle() {
      play(!playing);
    },
    reset,
    select(group, counts, signal = true) {
      uniforms.focus.value = group;
      const max = Math.max(1, ...counts);
      uniforms.load.value.fromArray(counts.map((n) => n / max));
      if (signal) uniforms.launch.value = uniforms.clock.value;
      host.dataset.service = group < 0 ? 'all' : services[group].id;
      invalidate();
    },
    dispose() {
      disposed = true;
      abort.abort();
      observer.disconnect();
      viewport.disconnect();
      cancelAnimationFrame(frame);
      const geometry = new Set(objects.map((o) => o.geometry));
      for (const g of geometry) g.dispose();
      for (const o of objects) o.material.dispose();
      renderer?.dispose();
    },
  };
}
