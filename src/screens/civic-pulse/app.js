/* SPDX-License-Identifier: MIT */
import { services, districts, snapshot, reports, states, clock, hourAt } from './data.js';
import { renderFlow, renderDonut, spark, statusColors } from './charts.js';
import { mountCanopy } from './scene.js';
import { mountChrome } from './chrome.js';

const by = (id) => document.getElementById(id);
const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const number = (n) => n.toLocaleString('zh-CN');
const abort = new AbortController(),
  opts = { signal: abort.signal };
let district = -1,
  service = -1,
  period = 24,
  data,
  chart,
  cursor = -1,
  feed = [],
  dialogList = [],
  opener = null,
  fromList = false;
by('services').innerHTML = services
  .map(
    (s, i) =>
      `<button type="button" class="service-row" data-service="${i}" style="--tone:${s.color}"><span class="glyph">${icon(s.icon)}</span><strong>${s.name}</strong><b></b><span class="track"><i></i></span></button>`,
  )
  .join('');
by('pins').innerHTML = services
  .map(
    (s, i) =>
      `<button type="button" class="pin" data-service="${i}" style="--tone:${s.color}">${s.name}</button>`,
  )
  .join('');
by('district-list').innerHTML = ['全市', ...districts.map((d) => d.name)]
  .map(
    (name, i) =>
      `<button type="button" class="district" data-district="${i - 1}"><strong>${name}</strong><small></small></button>`,
  )
  .join('');
const pins = [...by('pins').children],
  serviceRows = [...by('services').children],
  districtButtons = [...by('district-list').children];
const chrome = mountChrome(document.querySelector('.console-shell'));
const tree = mountCanopy(by('canopy'), pins, (playing, gpu) => {
  chrome.play(playing);
  const button = by('play'),
    label = playing ? '暂停信号' : '播放信号';
  button.setAttribute('aria-label', label);
  button.title = label;
  button.innerHTML = icon(playing ? 'pause' : 'play');
  by('canopy').setAttribute(
    'aria-label',
    (gpu ? '三维' : '二维投影') + '市政感知树，拖动或使用方向键旋转，按空格暂停，Home 复位',
  );
});

function eventRow(r) {
  return `<button type="button" class="event-row" data-event="${r.id}" style="--tone:${statusColors[r.status]}"><i></i><span><strong>${r.title}</strong><small>${districts[r.d].name} · ${states[r.status]}</small></span><time>${clock(r.minute)}</time></button>`;
}
function hideCursor() {
  cursor = -1;
  by('trend-tip').hidden = true;
  by('cursor')?.setAttribute('visibility', 'hidden');
}
function updateChart() {
  hideCursor();
  chart = renderFlow(by('trend'), data, period);
  for (const b of document.querySelectorAll('[data-period]'))
    b.setAttribute('aria-pressed', String(Number(b.dataset.period) === period));
}
function render(sendSignal = true) {
  data = snapshot(district, service);
  by('health').textContent = data.health.toFixed(1);
  by('health-bar').style.width = data.health + '%';
  by('tickets').textContent = number(data.total);
  by('timely').textContent = data.timely.toFixed(1);
  by('timely-bar').style.width = data.timely + '%';
  by('online').textContent = number(data.online);
  by('availability').textContent = data.availability.toFixed(1) + '%';
  by('spark').setAttribute('d', spark(data.inFlow.slice(-12)));
  by('hero-location').textContent = '福州 · ' + (district < 0 ? '全市' : districts[district].name);
  by('signal-name').textContent = service < 0 ? '全域感知' : services[service].name + '信号';
  by('signal-dot').style.background = service < 0 ? 'var(--teal)' : services[service].color;
  by('clear-service').disabled = service < 0;
  const max = Math.max(...data.byService);
  serviceRows.forEach((b, i) => {
    b.setAttribute('aria-pressed', String(i === service));
    pins[i].setAttribute('aria-pressed', String(i === service));
    b.querySelector('b').textContent = number(data.byService[i]);
    b.querySelector('.track i').style.width = (data.byService[i] * 100) / max + '%';
  });
  const all = data.byDistrict.reduce((a, b) => a + b, 0);
  districtButtons.forEach((b, i) => {
    b.setAttribute('aria-pressed', String(i - 1 === district));
    b.querySelector('small').innerHTML =
      number(i === 0 ? all : data.byDistrict[i - 1]) + '<i>件</i>';
  });
  renderDonut(by('donut'), data);
  by('done-percent').textContent = ((100 * data.done) / data.total).toFixed(1) + '%';
  by('state-list').innerHTML = [2, 1, 0]
    .map(
      (i) =>
        `<div style="--tone:${statusColors[i]}"><i aria-hidden="true"></i><dt>${states[i]}</dt><dd>${number([data.queued, data.active, data.done][i])}</dd></div>`,
    )
    .join('');
  updateChart();
  feed = reports.filter(
    (r) => (district < 0 || r.d === district) && (service < 0 || r.s === service),
  );
  by('feed').innerHTML = feed.slice(0, 4).map(eventRow).join('');
  tree.select(service, data.byService, sendSignal);
}

function showCursor(index) {
  cursor = Math.max(0, Math.min(period - 1, index));
  const k = chart.start + cursor,
    x = chart.X(cursor);
  const line = by('cursor');
  line.setAttribute('x1', x);
  line.setAttribute('x2', x);
  line.setAttribute('visibility', 'visible');
  const tip = by('trend-tip');
  tip.hidden = false;
  tip.textContent = `${hourAt(k)}　受理 ${data.inFlow[k]} · 办结 ${data.outFlow[k]}`;
}
const box = by('trend').parentElement;
box.addEventListener(
  'pointermove',
  (e) => {
    const r = by('trend').getBoundingClientRect();
    showCursor(
      Math.round(
        ((((e.clientX - r.left) / r.width) * 300 - chart.left) / (chart.right - chart.left)) *
          (period - 1),
      ),
    );
  },
  opts,
);
box.addEventListener('pointerleave', hideCursor, opts);
box.addEventListener('focus', () => showCursor(period - 1), opts);
box.addEventListener('blur', hideCursor, opts);
box.addEventListener(
  'keydown',
  (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      showCursor((cursor < 0 ? period - 1 : cursor) + (e.key === 'ArrowLeft' ? -1 : 1));
    }
  },
  opts,
);

const dialog = by('work-dialog');
function dispatchList() {
  fromList = true;
  by('dialog-title').textContent = '现场工单';
  by('dialog-content').innerHTML = dialogList.map(eventRow).join('');
  dialog.scrollTop = 0;
  if (!dialog.open) dialog.showModal();
  by('close-dialog').focus();
}
function detail(report) {
  service = report.s;
  render(true);
  chrome.pulse('feed');
  by('dialog-title').textContent = report.title;
  const props = [
    ['工单编号', report.id],
    ['所在片区', districts[report.d].name + ' · ' + districts[report.d].place],
    ['服务领域', services[report.s].name],
    ['承办班组', services[report.s].team],
    ['当前状态', states[report.status]],
  ];
  by('dialog-content').innerHTML =
    `<dl class="details">${props.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl><h3>处置记录</h3><ol class="steps">${report.stages.map((v, i) => `<li><time>${clock(v)}</time>${['事件受理入库', '派单至养护班组', '现场复核并办结'][i]}</li>`).join('')}</ol>${fromList ? '<button class="clear" type="button" data-back>返回工单列表</button>' : ''}`;
  dialog.scrollTop = 0;
  if (!dialog.open) dialog.showModal();
  by('close-dialog').focus();
}
document.addEventListener(
  'click',
  (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.district !== undefined) {
      district = Number(b.dataset.district);
      render();
      chrome.pulse('canopy');
      return;
    }
    if (b.dataset.service !== undefined) {
      const next = Number(b.dataset.service);
      service = service === next ? -1 : next;
      render();
      chrome.pulse('services');
      return;
    }
    if (b.dataset.period) {
      period = Number(b.dataset.period);
      updateChart();
      chrome.pulse('chart');
      return;
    }
    if (b.dataset.event) {
      const report = reports.find((r) => r.id === b.dataset.event);
      if (!dialog.open) {
        opener = b;
        fromList = false;
      }
      detail(report);
      return;
    }
    if (b.hasAttribute('data-back')) {
      dispatchList();
      return;
    }
    switch (b.id) {
      case 'clear-service':
        service = -1;
        render();
        chrome.pulse('services');
        serviceRows[0].focus();
        break;
      case 'all-events':
        opener = b;
        dialogList = feed;
        dispatchList();
        break;
      case 'close-dialog':
        dialog.close();
        break;
      case 'play':
        tree.toggle();
        break;
      case 'reset':
        tree.reset();
        break;
    }
  },
  opts,
);
dialog.addEventListener(
  'close',
  () => {
    const restore = opener?.isConnected
      ? opener
      : by('feed').querySelector('[data-event="' + opener?.dataset.event + '"]');
    (restore || by('all-events')).focus({ preventScroll: true });
    opener = null;
  },
  opts,
);
dialog.addEventListener(
  'click',
  (e) => {
    if (e.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
      dialog.close();
  },
  opts,
);
render(false);
window.VizLabRuntime.onDispose(() => {
  abort.abort();
  chrome.dispose();
  tree.dispose();
});
