/* SPDX-License-Identifier: MIT */
export const plots = ['北区一号棚', '湖东二号棚', '南区育苗棚'];
export const stages = ['开花', '膨果', '转色'];

const beds = [
  {
    variety: '普罗旺斯',
    plantCount: 1860,
    temp: 24.6,
    humidity: 67,
    light: 31.2,
    co2: 782,
    capacity: 42,
    water: 6.8,
  },
  {
    variety: '千禧',
    plantCount: 2140,
    temp: 25.1,
    humidity: 65,
    light: 32.5,
    co2: 816,
    capacity: 46,
    water: 7.5,
  },
  {
    variety: '粉贝贝',
    plantCount: 1420,
    temp: 23.8,
    humidity: 71,
    light: 28.4,
    co2: 756,
    capacity: 35,
    water: 5.6,
  },
];

export function getPlotReading(plotIndex, stageIndex) {
  const bed = beds[plotIndex];
  const delta = stageIndex - 1;
  return {
    plot: plots[plotIndex],
    stage: stages[stageIndex],
    variety: bed.variety,
    plantCount: bed.plantCount,
    day: [32, 61, 85][stageIndex] + plotIndex * 2,
    progress: [31, 62, 87][stageIndex] + plotIndex,
    temperature: +(bed.temp + delta * 0.6).toFixed(1),
    humidity: bed.humidity - delta * 2,
    soilTemperature: +(bed.temp - 2.9 + delta * 0.2).toFixed(1),
    soilMoisture: 52 + plotIndex * 2 - delta * 3,
    light: +(bed.light + delta * 0.7).toFixed(1),
    co2: bed.co2 + delta * 14,
    ec: [1.9, 2.4, 2.6][stageIndex],
    targetWater: +(bed.water * (1 + delta * 0.13)).toFixed(1),
  };
}

// This reproducible 30-day snapshot is shared by both chart windows.
const dailyIn = [
  58, 68, 68, 71, 65, 61, 72, 85, 72, 77, 63, 76, 79, 67, 70, 72, 81, 88, 75, 71, 83, 72, 77, 84,
  72, 86, 92, 81, 97, 89,
];
const dailyOut = [
  52, 65, 71, 66, 61, 73, 67, 79, 71, 83, 60, 67, 77, 62, 76, 63, 87, 83, 71, 76, 75, 80, 74, 73,
  79, 82, 84, 89, 92, 83,
];
const cameraNames = ['棚内通道', '番茄果序', '育苗苗床'];
const sensorSpecs = [
  ['空气温度', 'temperature', '°C', 1],
  ['空气湿度', 'humidity', '%', 0],
  ['光照度', 'light', 'klx', 1],
  ['基质温度', 'soilTemperature', '°C', 1],
  ['根区含水率', 'soilMoisture', '%', 0],
  ['二氧化碳', 'co2', 'ppm', 0],
];
const probes = [
  [
    'M8 4a2.5 2.5 0 0 1 5 0v8a4.5 4.5 0 1 1-5 0Zm2.5 3v9m5-10h3m-3 4h2',
    [-0.8, -0.4, -0.55, -0.2, 0.15, -0.1, 0],
  ],
  [
    'M10 2c-2 4-6 7.4-6 11a6 6 0 0 0 12 0c0-3.6-4-7-6-11ZM7 13a3 3 0 0 0 3 3',
    [2, 3, 1.5, 2.5, 1, -1, 0],
  ],
  [
    'M10 1v3m0 13v3M1 10h3m12 0h3M3.5 3.5l2 2m9 9 2 2m0-13-2 2m-9 9-2 2M14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
    [-4.4, -2.8, -3.3, -1, -1.5, 0.8, 0],
  ],
  [
    'M4 3h4m-2 0v9m-2 2 2-2 2 2m2-4 7-2m-7 6 7-2m-7 6 7-2',
    [-0.4, -0.55, -0.2, -0.3, -0.1, 0.12, 0],
  ],
  [
    'M4 3v7m4-7v7M2 12h9m-5 0v5m9-13c-1 2-3 4.2-3 6a3 3 0 1 0 6 0c0-1.8-2-4-3-6Z',
    [-2, 1, 4, 5, 3, 1, 0],
  ],
  [
    'M6 14l4-7m1 1 4 6M7 15h6M12 5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0ZM7 16a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Zm11 0a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z',
    [35, 16, 22, 6, 13, -8, 0],
  ],
];
const stores = [
  [
    { name: '冷链仓', capacity: 14, used: 8.8 },
    { name: '周转仓', capacity: 8, used: 3.1 },
  ],
  [
    { name: '冷链仓', capacity: 18, used: 12.6 },
    { name: '周转仓', capacity: 10, used: 5.2 },
  ],
  [
    { name: '冷链仓', capacity: 10, used: 6.3 },
    { name: '周转仓', capacity: 6, used: 2.7 },
  ],
];
const shapes = {
  water:
    '<path d="M12 3C9 7.3 5.5 10.7 5.5 14a6.5 6.5 0 1 0 13 0C18.5 10.7 15 7.3 12 3Z"/><path d="M9 14.5c.3 1.8 1.3 2.9 3.1 3.2"/>',
  trade: '<path d="M3 20h18M5 16v-5h3v5m3 0V6h3v10m3 0V9h3v7"/>',
  climate: '<path d="M9 4a2.5 2.5 0 0 1 5 0v9a5 5 0 1 1-5 0Z"/><path d="M11.5 8v8m5-10h3m-3 4h2"/>',
  inspection: '<rect x="3" y="6" width="12" height="12" rx="2"/><path d="m15 10 6-3v10l-6-3"/>',
};
const symbol = (name) =>
  `<svg class="vi-icon" viewBox="0 0 24 24" aria-hidden="true">${shapes[name]}</svg>`;
function heading(key, name, accessory) {
  return `<header class="vi-heading"><h2 id="vi-${key}-heading">${symbol(key)}${name}</h2>${accessory}</header>`;
}
function dateLabel(index) {
  const d = new Date(Date.UTC(2026, 9, 28 + index));
  return d.getUTCMonth() + 1 + '/' + String(d.getUTCDate()).padStart(2, '0');
}
function warehouse(period, plot, stage) {
  const kilogramsPerUnit = (beds[plot].plantCount / 1900) * [3.8, 4.5, 5.3][stage];
  const groups = [],
    step = period === 7 ? 1 : 5;
  for (let start = 30 - period; start < 30; start += step) {
    const end = start + step - 1;
    const sum = (series) =>
      series.slice(start, end + 1).reduce((v, n) => v + Math.round(n * kilogramsPerUnit), 0) / 1000;
    groups.push({
      received: sum(dailyIn),
      shipped: sum(dailyOut),
      label: dateLabel(end),
      range: step === 1 ? dateLabel(end) : dateLabel(start) + '–' + dateLabel(end),
    });
  }
  return groups;
}

export function mountInstruments(
  { irrigation, trade, climate, inspection },
  { cameraUrl, onPulse = () => {} },
) {
  const abort = new AbortController(),
    listen = { signal: abort.signal };
  const parts = {};
  let plot = 0,
    stage = 1,
    period = 7,
    camera = 0,
    groups = [],
    cursor = -1;
  const valves = beds.map((_, i) => ({ main: true, A: true, B: i === 1 }));
  function panel(key, host, title, accessory, body, icon = key) {
    const skin = document.createElement('div');
    skin.className = 'vi-body vi-' + key;
    skin.innerHTML = heading(icon, title, accessory) + body;
    host.setAttribute('aria-labelledby', 'vi-' + icon + '-heading');
    host.append(skin);
    parts[key] = skin;
    return skin;
  }
  const irrig = panel(
    'irrigation',
    irrigation,
    '水肥调控',
    '<span class="vi-caption">模拟控制</span>',
    `
    <div class="vi-flow">
      <div><span class="vi-label">主管流量</span><div class="vi-reading"><b data-flow></b><small>L/min</small></div></div>
      <button type="button" role="switch" aria-label="滴灌主阀" data-valve="main" class="vi-main-toggle"><span>滴灌主阀</span><span class="vi-switch"><i></i></span><strong data-valve-state></strong></button>
    </div>
    <div class="vi-manifold"><svg class="vi-pipe" viewBox="0 0 320 76" fill="none" aria-hidden="true">
    <g class="vi-pipe-a"><text x="4" y="15">A 液</text><path d="M35 12h25m13 0h16l18 23h20"/><circle cx="66.5" cy="12" r="6.5"/><path d="m64 9 6 3-6 3Z" class="vi-arrow"/></g>
    <g class="vi-pipe-b"><text x="4" y="64">B 液</text><path d="M35 61h25m13 0h16l18-21h20"/><circle cx="66.5" cy="61" r="6.5"/><path d="m64 58 6 3-6 3Z" class="vi-arrow"/></g>
    <g class="vi-pipe-main"><text x="4" y="40">水源</text><path d="M35 37h92m30 0h34m21 0h42m0 0h55m-57 0 18-21h39m-57 21 18 21h39"/>
    <path d="m91 34 5 3-5 3m79-6 5 3-5 3m65-6 5 3-5 3" class="vi-arrow"/>
    <rect x="127" y="21" width="30" height="33" rx="6" class="vi-mixer"/><path d="M131 31q5-4 11 0t11 0m-21 6q5-4 10 0t11 0m-10-14v5"/>
    <path d="m191 32 10 5-10 5Zm21 0-11 5 11 5Zm-11 5V25m-5 0h10"/>
    <circle cx="312" cy="16" r="2.3"/><circle cx="312" cy="37" r="2.3"/><circle cx="312" cy="58" r="2.3"/>
    <text x="142" y="71" text-anchor="middle">混配</text><text x="201" y="71" text-anchor="middle">主阀</text><text x="280" y="71" text-anchor="middle">滴灌支管</text>
    </g></svg></div>
    <div class="vi-pumps">${['A', 'B'].map((v) => `<button type="button" role="switch" aria-label="营养液 ${v} 泵" data-valve="${v}"><span class="vi-pump-name"><i></i>营养液 ${v}</span><strong data-valve-state></strong></button>`).join('')}</div>
    <div class="vi-dose"><div><span class="vi-label">今日灌溉量</span><span><b data-dose></b><small data-goal></small></span></div>
    <div class="vi-track" aria-hidden="true"><i data-water-bar></i></div></div>`,
    'water',
  );
  const trading = panel(
    'trade',
    trade,
    '产销流转',
    `<div class="vi-segments" role="group" aria-label="统计时段"><button type="button" data-days="7">7 天</button><button type="button" data-days="30">30 天</button></div>`,
    `
    <div class="vi-totals"><div><span class="vi-label"><i></i>入库</span><strong data-in></strong><small>t</small></div><div><span class="vi-label"><i></i>出库</span><strong data-out></strong><small>t</small></div></div>
    <div class="vi-chart" tabindex="0" role="group" aria-label="入库出库量，使用左右方向键查看分时读数">
    <svg viewBox="0 0 320 106" preserveAspectRatio="none" aria-hidden="true"></svg><output hidden></output></div>
    <div class="vi-storage"><div class="vi-storage-head"><b>库容占用</b><small>已占 / 总容量</small></div>
    <div class="vi-storage-sites"></div></div>`,
  );
  const env = panel(
    'climate',
    climate,
    '环境感知',
    '<span class="vi-badge"><i></i>近 30 分钟</span>',
    `
    <dl class="vi-sensors">${sensorSpecs.map(([name, key, unit], index) => `<div><dt><svg class="vi-probe" viewBox="0 0 20 21" aria-hidden="true"><path d="${probes[index][0]}"/></svg>${name}</dt><dd><b data-sensor="${key}"></b><small>${unit}</small><svg class="vi-spark" data-trend="${key}" viewBox="0 0 100 23" preserveAspectRatio="none" role="img"></svg></dd></div>`).join('')}</dl>
    <div class="vi-growth"><span class="vi-label">生育进程</span><div class="vi-growth-track" aria-hidden="true"><i></i></div><strong></strong></div>`,
  );
  const cams = panel(
    'inspection',
    inspection,
    '温室巡检',
    '<span class="vi-caption">演示快照</span>',
    `
    <div class="vi-feed"><img alt="" class="vi-strip"><div class="vi-camera-caption"><span><i></i><strong></strong></span><span class="vi-channel"></span></div></div>
    <div class="vi-camera-tabs" role="group" aria-label="巡检视角">${cameraNames.map((name, i) => `<button data-camera="${i}" type="button">${name}</button>`).join('')}</div>`,
  );
  const strip = cams.querySelector('.vi-strip');
  function sizeStrip() {
    if (strip.naturalHeight)
      strip.style.setProperty('--vi-ratio', strip.naturalWidth / strip.naturalHeight / 3);
  }
  strip.addEventListener('load', sizeStrip, listen);
  strip.src = cameraUrl;
  if (strip.complete) sizeStrip();
  function setCamera(i) {
    camera = i;
    strip.style.setProperty('--vi-image-shift', (-(camera + 0.5) * 100) / 3 + '%');
    strip.alt = cameraNames[camera] + '巡检示意快照';
    cams.querySelector('.vi-camera-caption strong').textContent = cameraNames[camera];
    cams.querySelector('.vi-channel').textContent = 'CAM / 0' + (camera + 1);
    for (const b of cams.querySelectorAll('[data-camera]'))
      b.setAttribute('aria-pressed', String(+b.dataset.camera === camera));
  }
  function updateWater() {
    const state = valves[plot],
      bed = beds[plot],
      reading = getPlotReading(plot, stage);
    const flow = state.main
      ? bed.capacity * (0.72 + 0.08 * stage) + (state.A ? 0.4 : 0) + (state.B ? 0.3 : 0)
      : 0;
    irrig.querySelector('[data-flow]').textContent = flow.toFixed(1);
    const pipe = irrig.querySelector('.vi-pipe');
    for (const channel of ['main', 'A', 'B'])
      pipe.classList.toggle('open-' + channel, state.main && state[channel]);
    const applied = +(reading.targetWater * (0.63 + plot * 0.05)).toFixed(1);
    irrig.querySelector('[data-dose]').textContent = applied.toFixed(1);
    irrig.querySelector('[data-goal]').textContent = ' / ' + reading.targetWater.toFixed(1) + ' m³';
    irrig.querySelector('[data-water-bar]').style.width =
      (applied / reading.targetWater) * 100 + '%';
    for (const b of irrig.querySelectorAll('[data-valve]')) {
      const key = b.dataset.valve,
        open = state.main && state[key];
      b.setAttribute('aria-checked', String(open));
      b.disabled = key !== 'main' && !state.main;
      b.querySelector('[data-valve-state]').textContent =
        key === 'main'
          ? open
            ? '开启'
            : '关闭'
          : b.disabled
            ? '联锁停止'
            : open
              ? '投加中'
              : '待机';
    }
  }
  function updateEnvironment() {
    const read = getPlotReading(plot, stage);
    sensorSpecs.forEach(([name, key, unit, digits], index) => {
      env.querySelector('[data-sensor="' + key + '"]').textContent = read[key].toFixed(digits);
      const offsets = probes[index][1];
      const samples = offsets.map(
        (_, i) => read[key] + (i === 6 ? 0 : offsets[(i + plot) % 6]) * (1 + stage * 0.1),
      );
      const low = Math.min(...samples),
        high = Math.max(...samples);
      const points = samples.map((v, i) => [2 + i * 16, 19 - (15 * (v - low)) / (high - low)]);
      const line = 'M' + points.map(([x, y]) => x + ' ' + y.toFixed(2)).join('L');
      const spark = env.querySelector('[data-trend="' + key + '"]');
      spark.setAttribute(
        'aria-label',
        name + '近 30 分钟 ' + low.toFixed(digits) + ' 至 ' + high.toFixed(digits) + ' ' + unit,
      );
      spark.innerHTML =
        '<path class="vi-spark-area" d="' +
        line +
        'V23H2Z"/><path class="vi-spark-line" d="' +
        line +
        '"/><circle cx="98" cy="' +
        points[6][1] +
        '" r="1.7"/>';
    });
    env.querySelector('.vi-growth-track i').style.width = read.progress + '%';
    env.querySelector('.vi-growth strong').textContent = read.progress + '%';
  }
  const chart = trading.querySelector('.vi-chart'),
    svg = chart.querySelector('svg'),
    tip = chart.querySelector('output');
  function showCursor(i) {
    cursor = i;
    tip.hidden = i < 0;
    if (i >= 0) {
      const value = groups[i];
      tip.textContent = `${value.range}　入 ${value.received.toFixed(2)}　出 ${value.shipped.toFixed(2)} t`;
    }
    for (const col of svg.querySelectorAll('[data-group]'))
      col.classList.toggle('vi-highlight', +col.dataset.group === i);
  }
  function updateTrade() {
    groups = warehouse(period, plot, stage);
    for (const b of trading.querySelectorAll('[data-days]'))
      b.setAttribute('aria-pressed', String(+b.dataset.days === period));
    for (const [sel, key] of [
      ['[data-in]', 'received'],
      ['[data-out]', 'shipped'],
    ]) {
      trading.querySelector(sel).textContent = groups.reduce((s, g) => s + g[key], 0).toFixed(1);
    }
    const max = Math.max(...groups.flatMap((g) => [g.received, g.shipped]));
    const unit = max < 1 ? 0.1 : 0.5,
      top = Math.ceil(max / (unit * 2)) * unit * 2;
    const x0 = 24,
      x1 = 319,
      y0 = 8,
      y1 = 87,
      step = (x1 - x0) / groups.length;
    const Y = (n) => y1 - (n / top) * (y1 - y0);
    const axis = [0, top / 2, top]
      .map(
        (n) =>
          `<line class="vi-gridline" x1="${x0}" x2="${x1}" y1="${Y(n)}" y2="${Y(n)}"/><text x="${x0 - 4}" y="${Y(n) + 3}" text-anchor="end">${Number(n.toFixed(1))}</text>`,
      )
      .join('');
    const bw = Math.min(9, step * 0.21);
    const marks = groups
      .map((g, i) => {
        const x = x0 + (i + 0.5) * step;
        return `<g data-group="${i}"><rect class="vi-bar-halo" x="${x - step * 0.43}" y="2" width="${step * 0.86}" height="89" rx="2"/>
      <rect x="${x - bw - 1.5}" y="${Y(g.received)}" width="${bw}" height="${y1 - Y(g.received)}" rx="1" fill="url(#vi-in-grad)"/><rect x="${x + 1.5}" y="${Y(g.shipped)}" width="${bw}" height="${y1 - Y(g.shipped)}" rx="1" fill="url(#vi-out-grad)"/>
      <text x="${x}" y="103" text-anchor="middle">${g.label}</text></g>`;
      })
      .join('');
    svg.innerHTML = `<defs><linearGradient id="vi-in-grad" x2="0" y2="1" gradientUnits="objectBoundingBox"><stop stop-color="#a9f5bd"/><stop offset=".12" stop-color="#6cd8a7"/><stop offset="1" stop-color="#2c735f"/></linearGradient><linearGradient id="vi-out-grad" x2="0" y2="1" gradientUnits="objectBoundingBox"><stop stop-color="#ffd0a7"/><stop offset=".12" stop-color="#f5a07b"/><stop offset="1" stop-color="#935c4c"/></linearGradient></defs>${axis}${marks}`;
    showCursor(-1);
  }
  irrig.addEventListener(
    'click',
    (e) => {
      const button = e.target.closest('[data-valve]');
      if (!button || button.disabled) return;
      const k = button.dataset.valve;
      valves[plot][k] = !valves[plot][k];
      updateWater();
      onPulse('irrigation');
    },
    listen,
  );
  trading.addEventListener(
    'click',
    (e) => {
      const b = e.target.closest('[data-days]');
      if (!b) return;
      period = +b.dataset.days;
      updateTrade();
      onPulse('trade');
    },
    listen,
  );
  cams.addEventListener(
    'click',
    (e) => {
      const b = e.target.closest('[data-camera]');
      if (!b) return;
      setCamera(+b.dataset.camera);
      onPulse('inspection');
    },
    listen,
  );
  chart.addEventListener(
    'pointermove',
    (e) => {
      const box = svg.getBoundingClientRect();
      if (box.width > 0) {
        const relative = (((e.clientX - box.left) * 320) / box.width - 24) / (319 - 24);
        showCursor(Math.max(0, Math.min(groups.length - 1, Math.floor(relative * groups.length))));
      }
    },
    listen,
  );
  chart.addEventListener('pointerleave', () => showCursor(-1), listen);
  chart.addEventListener('focus', () => showCursor(groups.length - 1), listen);
  chart.addEventListener('blur', () => showCursor(-1), listen);
  chart.addEventListener(
    'keydown',
    (e) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      e.preventDefault();
      showCursor(
        Math.max(
          0,
          Math.min(
            groups.length - 1,
            (cursor < 0 ? groups.length - 1 : cursor) + (e.key === 'ArrowRight' ? 1 : -1),
          ),
        ),
      );
    },
    listen,
  );
  function select(nextPlot, nextStage) {
    const changed = plot !== nextPlot;
    plot = nextPlot;
    stage = nextStage;
    updateWater();
    updateEnvironment();
    updateTrade();
    trading.querySelector('.vi-storage-sites').innerHTML = stores[plot]
      .map(({ name, used, capacity }) => {
        const pct = Math.round((used / capacity) * 100);
        return `<div><span>${name}<b>${pct}%</b></span><div class="vi-stock-track" aria-hidden="true"><i style="width:${pct}%"></i></div><small>${used.toFixed(1)} / ${capacity} t</small></div>`;
      })
      .join('');
    if (changed) setCamera(plot);
  }
  select(plot, stage);
  setCamera(0);
  return {
    select,
    dispose() {
      abort.abort();
      Object.values(parts).forEach((n) => n.remove());
    },
  };
}
