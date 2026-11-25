/* SPDX-License-Identifier: MIT */
import { laneWidth, radarRange, trafficX } from './radar.js';

function scope(canvas, sim) {
  const ctx = canvas.getContext('2d'),
    w = canvas.width,
    h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  function line(x, y, u, v, color, width = 1) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(u, v);
    ctx.stroke();
  }
  if (sim.mode === 'tunnel') {
    for (let i = 0; i < 4; i++) line(0, 6 + i * 33, w, 6 + i * 33, '#38494e');
    const Y = (v) => h - 6 - (v / 320) * (h - 13);
    ctx.setLineDash([5, 6]);
    line(0, Y(sim.targetKmh), w, Y(sim.targetKmh), '#758d95');
    ctx.setLineDash([]);
    ctx.strokeStyle = '#a9dfff';
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    for (let i = 0; i < sim.historyCount; i++) {
      const index =
        (sim.historyIndex + sim.history.length - sim.historyCount + 1 + i) % sim.history.length;
      const x = (w * (sim.history.length - sim.historyCount + i)) / (sim.history.length - 1),
        y = Y(sim.history[index]);
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.stroke();
  } else {
    const X = (x) => w * 0.5 - x * 19,
      Y = (z) => h * 0.7 - (z * h * 0.67) / radarRange;
    for (let n = -1.5; n <= 1.5; n++) line(X(n * laneWidth), 0, X(n * laneWidth), h, '#40565b');
    for (const z of [20, 40, 60]) line(X(-5.4), Y(z), X(5.4), Y(z), '#2f4348');
    for (const segment of sim.radar.segments) {
      if (segment.energy < 0.01) continue;
      const x = X(segment.endX),
        y = Y(segment.endZ);
      ctx.globalAlpha = segment.energy;
      line(X(segment.startX), Y(segment.startZ), x, y, '#9de3ea', 1.8);
      if (segment.vehicleHit) {
        ctx.fillStyle = '#ffcb87';
        ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
      }
    }
    ctx.globalAlpha = 1;
    const horizon = sim.pathLength;
    const gradient = ctx.createLinearGradient(0, Y(0), 0, Y(horizon));
    gradient.addColorStop(0, '#4288ff');
    gradient.addColorStop(0.43, '#7766ff');
    gradient.addColorStop(0.88, '#bc58f4');
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i <= 32; i++) {
      const z = (i / 32) * horizon;
      if (z) ctx.lineTo(X(sim.pathX(z)), Y(z));
      else ctx.moveTo(X(sim.x), Y(0));
    }
    ctx.stroke();
    for (const car of sim.cars)
      if (car.detected) {
        ctx.fillStyle = Math.abs(sim.x - trafficX(car)) < 2.8 && car.z > 0 ? '#ffc180' : '#7ccddd';
        ctx.fillRect(X(trafficX(car)) - 4, Y(car.z) - 3, 8, 6);
      }
    ctx.fillStyle = '#e1f5f0';
    ctx.beginPath();
    const x = X(sim.x),
      y = Y(0);
    ctx.moveTo(x, y - 6);
    ctx.lineTo(x + 5, y + 5);
    ctx.lineTo(x - 5, y + 5);
    ctx.fill();
  }
}

export function driveControls(getStudio, signal) {
  const by = (id) => document.getElementById(id),
    find = (s) => document.querySelector(s),
    lab = by('lab');
  const modes = [...document.querySelectorAll('button[data-mode]')],
    scenarios = [...document.querySelectorAll('[data-scenario]')];
  const on = (el, type, fn) => el.addEventListener(type, fn, { signal });
  const studioParts = [
    '.wind-panel',
    '.results-panel',
    '.cameras',
    '.orbit-hint',
    '.stage-tools',
    '#wind-note',
  ].map(find);
  const driveParts = [
    '.drive-panel',
    '.telemetry-panel',
    '.drive-hud',
    '.back-studio',
    '#drive-note',
  ].map(find);
  const text = (id, s) => {
    const el = by(id);
    if (el.textContent !== s) el.textContent = s;
  };
  let last = -1,
    lastScope = -1;
  function display(name) {
    const active = name !== 'studio',
      pilot = name === 'pilot';
    lab.dataset.mode = name;
    for (const b of modes) b.setAttribute('aria-pressed', String(b.dataset.mode === name));
    for (const el of studioParts) el.hidden = active;
    for (const el of driveParts) el.hidden = !active;
    by('warp-settings').hidden = pilot;
    by('traffic-settings').hidden = !pilot;
    by('reset-view').hidden = name !== 'tunnel';
    text('drive-title', pilot ? '自动驾驶控制' : '加速控制');
    text('telemetry-title', pilot ? '雷达与路径' : '穿梭遥测');
    text('telemetry-unit', pilot ? '360° / 68 m' : 'SPEED / TIME');
    text('primary-label', pilot ? '最近车辆回波' : '行驶距离');
    text('primary-unit', ' m');
    text('drive-restart', pilot ? '重置路况' : '重新起跑');
    text(
      'drive-note',
      pilot
        ? '封闭道路模拟 · 规划路线由近端蓝渐变至远端紫'
        : '拖动环绕 · 滚轮或双指缩放 · Home 复位视角',
    );
  }
  function update(sim, force = false) {
    if (force || lab.dataset.mode !== sim.mode) display(sim.mode);
    if (sim.mode === 'studio') return;
    const pilot = sim.mode === 'pilot';
    if (pilot && (force || sim.time < lastScope || sim.time - lastScope >= 1 / 30)) {
      scope(by('road-scope'), sim);
      lastScope = sim.time;
    }
    if (!force && sim.time >= last && sim.time - last < 0.095) return;
    last = sim.time;
    text('hud-speed', String(Math.round(sim.speed * 3.6)));
    text('hud-state', sim.decision);
    text('drive-status', sim.paused ? '已暂停' : '运行中');
    text('drive-pause', sim.paused ? '继续' : '暂停');
    by('drive-pause').setAttribute('aria-pressed', String(sim.paused));
    by('drive-step').disabled = !sim.paused;
    text(
      'drive-primary',
      pilot
        ? Number.isFinite(sim.nearest)
          ? sim.nearest.toFixed(1)
          : '—'
        : Math.round(sim.distance).toLocaleString('en-US'),
    );
    text(
      'drive-secondary',
      pilot
        ? '跟踪 ' +
            sim.targetCount +
            ' 个目标 · 可行轨迹 ' +
            sim.trajectory.feasible +
            '/' +
            sim.trajectory.tried
        : '加速度 ' + sim.acceleration.toFixed(1) + ' m/s²',
    );
    text('drive-plan', sim.decision);
    if (force)
      for (const b of scenarios)
        b.setAttribute('aria-pressed', String(b.dataset.scenario === sim.scenario));
    if (!pilot) scope(by('road-scope'), sim);
  }
  for (const b of modes) on(b, 'click', () => getStudio()?.setMode(b.dataset.mode));
  on(by('reset-view'), 'click', () => getStudio()?.resetTunnelCamera());
  on(find('.back-studio'), 'click', () => {
    getStudio()?.setMode('studio');
    modes[0].focus();
  });
  on(document, 'keydown', (e) => {
    if (e.key === 'Escape' && lab.dataset.mode !== 'studio') {
      getStudio()?.setMode('studio');
      modes[0].focus();
    }
  });
  for (const b of scenarios)
    on(b, 'click', () => {
      const studio = getStudio();
      if (!studio || studio.drive.scenario === b.dataset.scenario) return;
      studio.drive.scenario = b.dataset.scenario;
      studio.setMode('pilot', true);
    });
  on(by('warp-speed'), 'input', (e) => {
    const studio = getStudio();
    if (!studio) return;
    studio.drive.targetKmh = Number(e.target.value);
    text('warp-value', e.target.value + ' km/h');
    e.target.style.setProperty('--fill', ((e.target.value - 100) / 220) * 100 + '%');
    update(studio.drive, true);
  });
  by('warp-speed').style.setProperty('--fill', (160 / 220) * 100 + '%');
  on(by('drive-restart'), 'click', () => {
    const studio = getStudio();
    studio?.setMode(studio.drive.mode, true);
  });
  on(by('drive-pause'), 'click', () => {
    const studio = getStudio();
    if (!studio) return;
    studio.drive.paused = !studio.drive.paused;
    studio.last = 0;
    update(studio.drive, true);
    studio.request();
  });
  on(by('drive-step'), 'click', () => {
    const studio = getStudio();
    if (!studio?.drive.paused) return;
    studio.drive.advance(0.75);
    update(studio.drive, true);
    studio.request();
  });
  return {
    update,
    enable(ready) {
      for (const b of modes) b.disabled = !ready;
      if (!ready) display('studio');
    },
  };
}
