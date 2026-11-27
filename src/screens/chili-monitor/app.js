/* SPDX-License-Identifier: MIT */
import { mountChiliPanels } from './panels.js';
import { mountChiliPlant } from './plant.js';

const screen = document.querySelector('#chili-screen');
const plant = document.querySelector('#chili-plant');
const company = document.querySelector('#chili-company');
const plot = document.querySelector('#chili-plot');
const form = document.querySelector('.chili-filters');
const nav = screen.querySelector('.chili-header nav');
const lifecycle = new AbortController();
const { signal } = lifecycle;

const companies = [
  { name: '衡水辣椒种植基地', plots: ['冀州一号地块', '冀州二号地块'] },
  { name: '故城辣椒种植合作社', plots: ['故城一号地块', '故城二号地块'] },
];

const readings = [
  {
    soilTemperature: 26.8,
    soilHumidity: 48.5,
    illuminance: 175,
    airTemperature: 30.8,
    airHumidity: 37.6,
    carbonDioxide: 59.3,
    growth: 48.5,
    status: '好',
    stage: '发芽期',
    switches: [true, false, true, true, false],
  },
  {
    soilTemperature: 25.7,
    soilHumidity: 51.3,
    illuminance: 191,
    airTemperature: 29.6,
    airHumidity: 43.2,
    carbonDioxide: 60.1,
    growth: 60.2,
    status: '好',
    stage: '坐果期',
    switches: [true, true, true, false, false],
  },
  {
    soilTemperature: 24.3,
    soilHumidity: 46.9,
    illuminance: 162,
    airTemperature: 28.5,
    airHumidity: 42.1,
    carbonDioxide: 57.2,
    growth: 73.2,
    status: '好',
    stage: '膨果期',
    switches: [false, false, false, true, false],
  },
  {
    soilTemperature: 25.4,
    soilHumidity: 50.1,
    illuminance: 188,
    airTemperature: 29.1,
    airHumidity: 40.8,
    carbonDioxide: 58.7,
    growth: 92.6,
    status: '好',
    stage: '成熟期',
    switches: [true, true, false, true, false],
  },
];

const switchIndices = { water: 0, tankA: 1, tankB: 2, tankC: 3, tankD: 4 };
const panels = mountChiliPanels(screen, {
  signal,
  onSwitch(key, enabled) {
    activeReading().switches[switchIndices[key]] = enabled;
  },
});
window.VizLabRuntime.mountStage(screen, 1651, 953);
const disposePlant = mountChiliPlant(plant, { leafUrl: screen.dataset.leaf });

const options = (hint, names) => [
  new Option(hint, ''),
  ...names.map((name, index) => new Option(name, String(index))),
];

function activeReading() {
  const companyIndex = Number(company.value);
  const plotIndex = Number(plot.value);
  return readings[companyIndex * 2 + plotIndex];
}

function updatePlotChoices() {
  const names =
    company.value === ''
      ? companies.flatMap((item) => item.plots)
      : companies[Number(company.value)].plots;
  plot.replaceChildren(...options('地块', names));
  if (company.value !== '') {
    plot.options[0].disabled = true;
    plot.value = '0';
  }
}

company.replaceChildren(
  ...options(
    '企业名称',
    companies.map((item) => item.name),
  ),
);
updatePlotChoices();

company.addEventListener(
  'change',
  () => {
    updatePlotChoices();
    panels.update(activeReading());
  },
  { signal },
);
plot.addEventListener(
  'change',
  () => {
    if (company.value === '' && plot.value !== '') {
      const selected = Number(plot.value);
      company.value = String(Math.floor(selected / 2));
      updatePlotChoices();
      plot.value = String(selected % 2);
    }
    panels.update(activeReading());
  },
  { signal },
);
form.addEventListener('submit', (event) => event.preventDefault(), { signal });

const navTargets = {
  industry: '.chili-warehouses',
  trade: '.chili-shipments',
  iot: '.chili-irrigation',
  trace: '.chili-camera',
  research: '.chili-cultivation',
};
nav.addEventListener(
  'click',
  (event) => {
    const button = event.target.closest('[data-nav]');
    if (!button) return;
    for (const item of nav.querySelectorAll('[data-nav]')) {
      item.setAttribute('aria-pressed', String(item === button));
    }
    screen.querySelector('.chili-nav-target')?.classList.remove('chili-nav-target');
    const selector = navTargets[button.dataset.nav];
    if (selector) screen.querySelector(selector)?.classList.add('chili-nav-target');
  },
  { signal },
);

window.VizLabRuntime.onDispose(() => {
  lifecycle.abort();
  disposePlant();
});
