/* SPDX-License-Identifier: MIT */
import { getPlotReading, mountInstruments, plots, stages } from './instruments.js';
import { mountFinish } from './finish.js';
import { mountSpecimen } from './specimen.js';

const by = (id) => document.getElementById(id);
const lab = by('lab'),
  chamber = lab.querySelector('.specimen'),
  host = by('specimen-host');
const fields = Object.fromEntries(
  ['irrigation', 'trade', 'climate', 'inspection'].map((name) => [
    name,
    lab.querySelector('[data-finish="' + name + '"]'),
  ]),
);
const labels = [
  ['花冠展开，可观察花序分枝与授粉位置。', '星形花萼托住花冠，花后逐渐形成幼果。'],
  ['坐果后果径增大，同一果序可见大小差异。', '沿果柄观察果簇，比较同穗幼果的轮廓。'],
  ['果皮由青转红，同一果序分批成熟。', '选中红色果实，可查看果序编号与当前阶段。'],
];
let plot = 0,
  stage = 2,
  view = 'scan';
const select = by('plot');
select.replaceChildren(...plots.map((name, i) => new Option(name, String(i))));
const steps = by('stages');
for (const [i, name] of stages.entries()) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.stage = i;
  button.innerHTML = '<i aria-hidden="true"></i>' + name + '期';
  steps.append(button);
}
let finish;
const panels = mountInstruments(fields, {
  cameraUrl: lab.dataset.camera,
  onPulse: (name) => finish?.pulse(name),
});
finish = mountFinish(lab, { fasciaUrl: lab.dataset.fascia, bezelUrl: lab.dataset.bezel });
const specimen = mountSpecimen(host, {
  leafUrl: lab.dataset.leaf,
  scanLeafUrl: lab.dataset.scanLeaf,
  onPick(index) {
    if (!Number.isInteger(index) || index < 0) {
      by('fruit-detail').hidden = true;
      return;
    }
    const detail = by('fruit-detail');
    detail.innerHTML =
      '<b>果实 ' +
      String(index + 1).padStart(2, '0') +
      '</b>' +
      getPlotReading(plot, stage).variety +
      ' · ' +
      stages[stage] +
      '期';
    detail.hidden = false;
    finish.pulse('specimen');
  },
  onPlay(playing) {
    finish.play(playing);
    panels.play(playing);
    const pause = by('pause'),
      label = playing ? '暂停动效' : '播放动效';
    pause.setAttribute('aria-label', label);
    pause.title = label;
    pause.querySelector('use').setAttribute('href', playing ? '#bot-pause' : '#bot-play');
  },
});
function render() {
  const record = getPlotReading(plot, stage);
  select.value = String(plot);
  by('cultivar').textContent = record.variety;
  by('plant-count').textContent = record.plantCount.toLocaleString('zh-CN');
  by('day').textContent = record.day;
  by('crop-note').textContent = labels[stage][1];
  by('stage-note').textContent = labels[stage][0];
  for (const b of steps.children)
    b.setAttribute('aria-pressed', String(Number(b.dataset.stage) === stage));
  by('fruit-detail').hidden = true;
  chamber.dataset.mode = view;
  for (const b of lab.querySelectorAll('[data-view]'))
    b.setAttribute('aria-pressed', String(b.dataset.view === view));
  panels.select(plot, stage);
  specimen.select(stage, plot);
  specimen.setMode(view);
}
const abort = new AbortController(),
  options = { signal: abort.signal };
select.addEventListener(
  'change',
  () => {
    plot = Number(select.value);
    render();
    finish.pulse('climate');
  },
  options,
);
lab.addEventListener(
  'click',
  (event) => {
    const b = event.target.closest('button');
    if (!b) return;
    if (b.dataset.stage !== undefined) {
      stage = Number(b.dataset.stage);
      render();
      finish.pulse('specimen');
    }
    if (b.dataset.view) {
      view = b.dataset.view;
      specimen.setMode(view);
      chamber.dataset.mode = view;
      by('fruit-detail').hidden = true;
      for (const item of lab.querySelectorAll('[data-view]'))
        item.setAttribute('aria-pressed', String(item === b));
      finish.pulse('specimen');
    }
    if (b.id === 'labels') {
      const show = chamber.dataset.annotate === 'off';
      chamber.dataset.annotate = show ? 'on' : 'off';
      b.setAttribute('aria-pressed', String(show));
    }
    if (b.id === 'expand') {
      if (chamber.classList.contains('expanded') || document.fullscreenElement === chamber) {
        chamber.classList.remove('expanded');
        if (document.fullscreenElement === chamber) document.exitFullscreen().catch(() => {});
      } else {
        chamber.classList.add('expanded');
        chamber.requestFullscreen?.().catch(() => {});
      }
      updateExpandedLabel();
    }
    if (b.id === 'pause') specimen.toggle();
    if (b.id === 'reset') {
      specimen.reset();
      by('fruit-detail').hidden = true;
    }
  },
  options,
);
function updateExpandedLabel() {
  const label = chamber.classList.contains('expanded') ? '收起植株' : '展开植株';
  by('expand').setAttribute('aria-label', label);
  by('expand').title = label;
}
document.addEventListener(
  'fullscreenchange',
  () => {
    if (document.fullscreenElement !== chamber) chamber.classList.remove('expanded');
    updateExpandedLabel();
  },
  options,
);
document.addEventListener(
  'keydown',
  (e) => {
    if (
      e.key === 'Escape' &&
      chamber.classList.contains('expanded') &&
      !document.fullscreenElement
    ) {
      chamber.classList.remove('expanded');
      updateExpandedLabel();
      by('expand').focus();
    }
  },
  options,
);
render();
window.VizLabRuntime.onDispose(() => {
  abort.abort();
  panels.dispose();
  specimen.dispose();
  finish.dispose();
});
