/* SPDX-License-Identifier: MIT */
import { coordinates, links, stations } from './data.js';
import { createEarthScene } from './earth.js';

const screen = document.querySelector('#screen');
const get = (id) => document.getElementById(id);
const surface = get('earth-surface');
const canvas = get('relay-earth');
const lightButtons = [...screen.querySelectorAll('[data-light]')];
const controls = [...screen.querySelectorAll('.control-group button')];
const motionButton = get('toggle-motion');
const linksButton = get('toggle-links');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const events = new AbortController();
const listener = { signal: events.signal };
const stationButtons = new Map();
const pins = new Map();
let playing = !reducedMotion.matches;

function sparkline(values) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const line = document.createElementNS(svg.namespaceURI, 'polyline');
  svg.setAttribute('viewBox', '0 0 56 24');
  svg.setAttribute('class', 'spark');
  svg.setAttribute('aria-hidden', 'true');
  const points = values.map(
    (v, i) => 1 + (54 * i) / (values.length - 1) + ',' + (23 - (21 * v) / 12),
  );
  line.setAttribute('points', points.join(' '));
  svg.append(line);
  return svg;
}

function drawStars() {
  const field = get('star-field');
  field.width = 1200;
  field.height = 714;
  const context = field.getContext('2d');
  if (!context) return;
  let seed = 357831;
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  for (let i = 0; i < 410; i++) {
    const x = random() * field.width;
    const y = random() * field.height;
    const intensity = random();
    context.fillStyle = 'rgba(190,213,228,' + (0.15 + intensity * 0.61) + ')';
    context.beginPath();
    context.arc(x, y, 0.36 + intensity ** 3 * 0.84, 0, Math.PI * 2);
    context.fill();
  }
}

function updateClock() {
  if (document.hidden) return;
  const utc = new Date().toISOString();
  get('utc-clock').textContent = utc.slice(11, 19);
  get('utc-clock').dateTime = utc;
  get('utc-date').textContent = utc.slice(0, 10);
  get('utc-date').dateTime = utc.slice(0, 10);
}
drawStars();
updateClock();
const clockTimer = setInterval(updateClock, 1000);
document.addEventListener('visibilitychange', updateClock, listener);

for (const station of stations) {
  const row = document.createElement('li');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'station-button';
  button.setAttribute('aria-pressed', 'false');
  const status = document.createElement('i');
  status.className = 'station-status';
  status.title = '在线';
  const name = document.createElement('span');
  name.className = 'station-name';
  name.append(status, station.name);
  const code = document.createElement('span');
  code.className = 'station-code';
  code.textContent = station.code;
  const identity = document.createElement('span');
  identity.append(name, code);
  const latency = document.createElement('span');
  latency.className = 'station-rtt';
  const unit = document.createElement('small');
  unit.textContent = ' ms';
  latency.append(String(station.rtt), unit);
  button.append(identity, sparkline(station.trend), latency);
  button.addEventListener('click', () => selectStation(station, true), listener);
  row.append(button);
  get('stations').append(row);

  const mapPin = document.createElement('button');
  mapPin.type = 'button';
  mapPin.className = 'map-pin';
  mapPin.style.left = ((station.longitude + 180) / 360) * 100 + '%';
  mapPin.style.top = ((90 - station.latitude) / 180) * 100 + '%';
  mapPin.title = station.name + ' · ' + station.code;
  mapPin.setAttribute('aria-label', '在地图上选择' + station.name);
  mapPin.addEventListener('click', () => selectStation(station, true), listener);
  get('locator-map').append(mapPin);
  stationButtons.set(station.code, [button, mapPin]);

  const pin = document.createElement('div');
  pin.className = 'earth-pin';
  pin.dataset.name = station.name;
  pin.textContent = station.code;
  pin.hidden = true;
  pins.set(station.code, pin);
  get('earth-labels').append(pin);
}

const scene = createEarthScene(surface, canvas, pins, {
  onStationClick: (station) => selectStation(station, true),
  onViewChange(latitude, longitude) {
    const position = '中心 ' + coordinates(latitude, longitude, 1);
    if (get('view-center').textContent !== position) get('view-center').textContent = position;
  },
  onRenderer(backend) {
    const unavailable = backend === 'fallback';
    surface.dataset.renderer = backend;
    canvas.hidden = unavailable;
    canvas.tabIndex = unavailable ? -1 : 0;
    for (const control of controls) control.disabled = unavailable;
    get('view-help').hidden = unavailable;
    get('scene-status').hidden = !unavailable;
    if (unavailable) {
      const fallback = get('earth-fallback');
      fallback.src = fallback.dataset.src;
      fallback.hidden = false;
      get('view-center').textContent = '';
      get('earth-labels').hidden = true;
      get('scene-status').textContent = '三维渲染不可用 · 静态预览';
      get('station-hint').textContent = '选择看数据';
    }
    get('render-mode').textContent = { webgpu: 'WebGPU', webgl2: 'WebGL 2', fallback: '静态预览' }[
      backend
    ];
  },
});

function toggle(button, active) {
  button.setAttribute('aria-pressed', String(active));
}

function updateTrend(station) {
  const width = 270;
  const baseline = 123;
  const points = station.trend.map((value, index) => [
    (index * width) / (station.trend.length - 1),
    baseline - value * 10,
  ]);
  const path = 'M' + points.map(([x, y]) => x.toFixed(2) + ',' + y.toFixed(2)).join(' L');
  get('trend-line').setAttribute('d', path);
  get('trend-area').setAttribute('d', path + ` L${width},${baseline} L0,${baseline} Z`);
  get('trend-end').setAttribute('cx', points.at(-1)[0]);
  get('trend-end').setAttribute('cy', points.at(-1)[1]);
  const low = Math.min(...station.trend).toFixed(2);
  const high = Math.max(...station.trend).toFixed(2);
  get('chart-description').textContent =
    `${station.name}过去 24 小时吞吐量，最低 ${low} Gb/s，最高 ${high} Gb/s`;
}

function updateLinks(code) {
  const connected = links.filter(({ from, to }) => from === code || to === code);
  get('route-count').textContent = connected.length + ' 条';
  get('site-links').replaceChildren(
    ...connected.map(({ from, to, rtt }) => {
      const row = document.createElement('li');
      row.style.setProperty('--latency', (rtt / 200) * 100 + '%');
      const route = document.createElement('span');
      const arrow = document.createElement('i');
      arrow.className = 'route-arrow';
      arrow.textContent = '↔';
      route.append(code, arrow, from === code ? to : from);
      const delay = document.createElement('span');
      delay.textContent = rtt + ' ms';
      row.append(route, delay);
      return row;
    }),
  );
}

function selectStation(station, focus) {
  for (const [code, buttons] of stationButtons) {
    for (const button of buttons) toggle(button, code === station.code);
  }
  for (const [code, pin] of pins) pin.dataset.selected = String(code === station.code);
  get('site-name').textContent = station.name;
  get('site-code').textContent = station.code;
  get('map-station').textContent = station.name + ' · ' + station.code;
  get('site-coordinates').textContent = coordinates(station.latitude, station.longitude);
  get('site-rtt').textContent = station.rtt;
  get('site-rate').textContent = station.trend.at(-1).toFixed(2);
  updateTrend(station);
  updateLinks(station.code);
  scene.selectStation(station, focus);
}

function updateMotion() {
  screen.dataset.playing = String(playing);
  toggle(motionButton, playing);
  scene.setMotion(playing, reducedMotion.matches);
}

for (const button of lightButtons) {
  button.addEventListener(
    'click',
    () => {
      for (const other of lightButtons) toggle(other, other === button);
      scene.setLighting(button.dataset.light);
    },
    listener,
  );
}
linksButton.addEventListener(
  'click',
  () => {
    const visible = linksButton.getAttribute('aria-pressed') !== 'true';
    toggle(linksButton, visible);
    scene.setLinksVisible(visible);
  },
  listener,
);
motionButton.addEventListener(
  'click',
  () => {
    playing = !playing;
    updateMotion();
  },
  listener,
);
reducedMotion.addEventListener(
  'change',
  () => {
    if (reducedMotion.matches) playing = false;
    updateMotion();
  },
  listener,
);
get('reset-view').addEventListener('click', scene.resetView, listener);

const mean = stations.reduce((sum, station) => sum + station.rtt, 0) / stations.length;
get('online-count').textContent = String(stations.length).padStart(2, '0');
get('station-total').textContent = '/ ' + String(stations.length).padStart(2, '0');
get('link-count').textContent = String(links.length).padStart(2, '0');
get('mean-rtt').textContent = Math.round(mean);
get('total-rate').textContent = stations
  .reduce((total, station) => total + station.trend.at(-1), 0)
  .toFixed(2);
selectStation(stations[0], false);
updateMotion();
VizLabRuntime.mountStage(screen, 1920, 1080, scene.resize);
VizLabRuntime.onDispose(() => {
  clearInterval(clockTimer);
  events.abort();
  scene.dispose();
});
