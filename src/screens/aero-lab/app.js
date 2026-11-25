/* SPDX-License-Identifier: MIT */
import { gsap } from 'gsap';
import { finishes } from './finish.js';
import { readings } from './airflow.js';
import { VehicleStudio } from './vehicle.js';
import { driveControls } from './drive-controls.js';

const get = (id) => document.getElementById(id);
const stage = get('stage'),
  canvas = get('vehicle'),
  msg = get('message'),
  media = matchMedia('(prefers-reduced-motion: reduce)');
const controller = new AbortController(),
  options = { signal: controller.signal };
const state = {
  from: 2,
  to: 0,
  t: 1,
  queued: null,
  wind: false,
  ran: false,
  speed: 160,
  yaw: 0,
  actual: 0,
  section: { front: Number(stage.dataset.frontArea), side: Number(stage.dataset.sideArea) },
};
let studio,
  paintTween,
  importId = 0;
const drivingUI = driveControls(() => studio, controller.signal);
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const percentage = (el) =>
  el.style.setProperty('--fill', ((el.value - el.min) / (el.max - el.min)) * 100 + '%');
function notice(text) {
  msg.textContent = text;
  msg.hidden = !text;
}
function camera(name) {
  for (const button of document.querySelectorAll('[data-camera]'))
    button.setAttribute('aria-pressed', String(button.dataset.camera === name));
  canvas.dataset.view = name;
}

function renderFinish() {
  const p = Math.round(state.t * 100);
  get('reveal').value = p;
  percentage(get('reveal'));
  get('reveal-value').textContent = p + '%';
  stage.dataset.reveal = String(p);
  studio?.setPaint(state.from, state.to, state.t);
  get('paint-name').textContent =
    state.t === 0 ? finishes[state.from].name : finishes[state.to].name;
  for (const button of get('paints').children)
    button.setAttribute('aria-pressed', String(Number(button.dataset.index) === state.to));
}
function playFinish() {
  paintTween?.kill();
  const complete = () => {
    paintTween = null;
    state.t = 1;
    renderFinish();
    const next = state.queued;
    state.queued = null;
    if (next !== null && next !== state.to) chooseFinish(next);
  };
  if (media.matches) {
    complete();
    return;
  }
  paintTween = gsap.to(state, {
    t: 1,
    duration: Math.max(0.14, 2.6 * (1 - state.t)),
    ease: 'sine.inOut',
    onUpdate: renderFinish,
    onComplete: complete,
  });
}
function chooseFinish(index) {
  if (index === state.to) {
    state.queued = null;
    if (state.t < 1) playFinish();
    return;
  }
  if (state.t > 0 && state.t < 1) {
    state.queued = index;
    if (!paintTween) playFinish();
    return;
  }
  state.from = state.t === 0 ? state.from : state.to;
  state.to = index;
  state.t = 0;
  state.queued = null;
  renderFinish();
  playFinish();
}
for (const [i, finish] of finishes.entries()) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'swatch';
  button.dataset.index = i;
  button.style.setProperty('--paint', finish.color);
  if (finish.graphic) {
    button.classList.add('graphic-swatch');
    button.style.setProperty(
      '--decal',
      'url("' + new URL(stage.dataset.livery, document.baseURI).href + '")',
    );
  }
  button.setAttribute('aria-label', finish.name);
  button.title = finish.name;
  button.disabled = true;
  button.addEventListener('click', () => chooseFinish(i), options);
  get('paints').append(button);
}
get('replay').addEventListener(
  'click',
  () => {
    state.queued = null;
    state.t = 0;
    renderFinish();
    playFinish();
  },
  options,
);
get('reveal').addEventListener(
  'input',
  (e) => {
    paintTween?.kill();
    paintTween = null;
    state.queued = null;
    state.t = Number(e.target.value) / 100;
    renderFinish();
  },
  options,
);
media.addEventListener(
  'change',
  () => {
    if (media.matches && paintTween) paintTween.progress(1);
    studio?.reducedMotion();
    studio?.wind(state.speed, state.yaw, state.wind);
  },
  options,
);
document.addEventListener('visibilitychange', () => paintTween?.paused(document.hidden), options);

function plot(kmh) {
  const ceiling = Math.max(1, readings(300, 15, state.section).force * 1.035);
  const xy = (v) => [
    3 + (434 * v) / 300,
    68 - (62 * readings(v, state.yaw, state.section).force) / ceiling,
  ];
  let path = '';
  for (let n = 0; n <= 30; n++) {
    const [x, y] = xy(n * 10);
    path += (n ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(2);
  }
  const [x, y] = xy(kmh);
  get('chart-line').setAttribute('d', path);
  get('chart-area').setAttribute('d', path + 'L437 68H3Z');
  get('chart-guide').setAttribute('d', `M${x} 68V${y}`);
  get('chart-dot').setAttribute('cx', x);
  get('chart-dot').setAttribute('cy', y);
}
function updateReadings(kmh) {
  const { force, pressure, cd, area } = readings(kmh, state.yaw, state.section);
  get('force').textContent = fmt(force);
  get('pressure').textContent = pressure.toFixed(2);
  get('cd').textContent = cd.toFixed(3);
  get('section-area').textContent = area.toFixed(2);
  get('curve').setAttribute(
    'aria-label',
    `风速 ${Math.round(kmh)} km/h，估算阻力 ${Math.round(force)} N`,
  );
  plot(kmh);
}
function syncBench() {
  get('lab').dataset.running = String(state.wind);
  get('bench-state').textContent = state.wind
    ? '送风中'
    : state.ran
      ? '暂停 · ' + Math.round(state.actual) + ' km/h'
      : '待机';
  get('end-test').hidden = !state.ran;
  get('run').setAttribute('aria-pressed', String(state.wind));
  get('run').querySelector('span').textContent = state.wind
    ? '暂停风洞'
    : state.ran
      ? '恢复风洞'
      : '启动风洞';
  get('speed-value').textContent = state.speed + ' km/h';
  get('yaw-value').textContent = (state.yaw > 0 ? '+' : '') + state.yaw + '°';
  percentage(get('speed'));
  percentage(get('yaw'));
  studio?.wind(state.speed, state.yaw, state.wind);
  updateReadings(state.ran ? state.actual : state.speed);
}
get('speed').addEventListener(
  'input',
  (e) => {
    state.speed = Number(e.target.value);
    syncBench();
  },
  options,
);
get('yaw').addEventListener(
  'input',
  (e) => {
    state.yaw = Number(e.target.value);
    syncBench();
  },
  options,
);
get('run').disabled = true;
get('run').addEventListener(
  'click',
  () => {
    state.wind = !state.wind;
    state.ran = true;
    syncBench();
  },
  options,
);
get('end-test').addEventListener(
  'click',
  () => {
    studio?.resetWind();
    state.wind = state.ran = false;
    state.actual = 0;
    syncBench();
  },
  options,
);
get('light').addEventListener(
  'click',
  () => {
    const dark = get('light').getAttribute('aria-pressed') !== 'true';
    get('light').setAttribute('aria-pressed', String(dark));
    get('light').querySelector('span').textContent = dark ? '暗调影棚' : '明调影棚';
    studio.light(dark);
  },
  options,
);
for (const button of document.querySelectorAll('[data-camera]'))
  button.addEventListener('click', () => studio.preset(button.dataset.camera), options);

function model(info, count, section) {
  state.section = section;
  stage.dataset.frontArea = section.front.toFixed(4);
  stage.dataset.sideArea = section.side.toFixed(4);
  updateReadings(state.ran ? state.actual : state.speed);
  get('car-name').textContent = info.name;
  get('car-make').textContent = info.make;
  const credit = get('model-credit'),
    license = get('model-license');
  if (info.privateCar) {
    credit.textContent = 'Centenario · OUTPISTON / Real Racing 3';
    credit.href =
      'https://sketchfab.com/3d-models/2017-lamborghini-centenario-bed90ff6a4934a16b83f05dec5aeaafb';
    license.textContent = 'CC BY-NC-SA 4.0';
    license.href = 'https://creativecommons.org/licenses/by-nc-sa/4.0/';
  } else if (info.custom) {
    credit.textContent = '本地载入模型';
    credit.removeAttribute('href');
  } else {
    credit.textContent = 'Aventador · Arion Digital';
    credit.href =
      'https://sketchfab.com/3d-models/lamborghini-aventador-888e37a3641d4f7b94bc1a39396e2441';
    license.textContent = 'CC BY 4.0';
    license.href = 'https://creativecommons.org/licenses/by/4.0/';
  }
  license.hidden = !!info.custom;
  stage.dataset.renderer = 'webgl2';
  drivingUI.enable(true);
  canvas.tabIndex = 0;
  for (const el of document.querySelectorAll('[data-camera],#import,#light,#run'))
    el.disabled = false;
  for (const el of [...get('paints').children, get('reveal'), get('replay')]) el.disabled = !count;
  notice(count ? '' : '该模型未标记可变色的车身面板');
}
function fallback(text) {
  studio?.dispose();
  studio = null;
  paintTween?.kill();
  canvas.hidden = true;
  canvas.tabIndex = -1;
  get('poster').src = get('poster').dataset.src;
  get('poster').hidden = false;
  stage.dataset.renderer = 'fallback';
  drivingUI.enable(false);
  for (const el of document.querySelectorAll(
    '[data-camera],#import,#light,#run,#paints button,#reveal,#replay',
  ))
    el.disabled = true;
  state.wind = state.ran = false;
  syncBench();
  get('bench-state').textContent = '静态预览';
  notice(text + ' · 可调节参数查看估算');
}
function checkGLB(buffer) {
  if (buffer.byteLength < 20) throw new Error('请选择完整的 GLB 文件');
  const view = new DataView(buffer);
  if (
    view.getUint32(0, true) !== 0x46546c67 ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== buffer.byteLength ||
    view.getUint32(16, true) !== 0x4e4f534a
  )
    throw new Error('请选择 glTF 2.0 单文件 GLB');
  const doc = JSON.parse(
    new TextDecoder().decode(new Uint8Array(buffer, 20, view.getUint32(12, true))),
  );
  if (
    [...(doc.buffers || []), ...(doc.images || [])].some((r) => r.uri && !r.uri.startsWith('data:'))
  )
    throw new Error('请选择已内嵌纹理和网格的 GLB');
}
get('import').addEventListener('click', () => get('file').click(), options);
get('file').addEventListener(
  'change',
  async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file || !studio) return;
    const id = ++importId;
    studio.revision++;
    notice('正在载入 ' + file.name);
    try {
      const buf = await file.arrayBuffer();
      if (id !== importId || !studio) return;
      checkGLB(buf);
      await studio.load(buf, file.name);
    } catch (error) {
      if (id === importId) notice('载入失败 · ' + error.message);
    }
  },
  options,
);
renderFinish();
syncBench();
async function initialize() {
  try {
    studio = new VehicleStudio(stage, {
      model,
      camera,
      driving: drivingUI.update,
      failure: fallback,
      reading(speed) {
        if (state.actual !== speed) {
          state.actual = speed;
          updateReadings(speed);
        }
        const status = '送风 · ' + Math.round(speed) + ' km/h';
        if (get('bench-state').textContent !== status) get('bench-state').textContent = status;
      },
    });
    await studio.init();
  } catch (error) {
    console.warn('Vehicle studio unavailable', error);
    fallback('三维影棚不可用');
  }
}
VizLabRuntime.onDispose(() => {
  importId++;
  controller.abort();
  paintTween?.kill();
  studio?.dispose();
});
initialize();
