/* SPDX-License-Identifier: MIT */

const cameraLabels = ['闸口', '田间', '灌溉渠'];

export function mountChiliPanels(root, { onSwitch, signal } = {}) {
  const switches = Array.from(root.querySelectorAll('[data-chili-switch]'));
  const readings = root.querySelectorAll('[data-chili-reading]');
  const growth = root.querySelector('.chili-growth');
  const growthValue = root.querySelector('[data-chili-growth]');
  const growthProgress = root.querySelector('.chili-growth-progress');
  const status = root.querySelector('[data-chili-status]');
  const stage = root.querySelector('[data-chili-stage]');
  const camera = root.querySelector('[data-chili-camera]');
  const cameraCaption = root.querySelector('[data-chili-camera-caption]');
  let cameraIndex = 0;

  function setSwitch(button, enabled) {
    button.setAttribute('aria-checked', String(enabled));
    button.querySelector('strong').textContent = enabled ? '开' : '关';
  }

  for (const button of switches) {
    button.addEventListener(
      'click',
      () => {
        const enabled = button.getAttribute('aria-checked') === 'false';
        setSwitch(button, enabled);
        onSwitch?.(button.dataset.chiliSwitch, enabled);
      },
      { signal },
    );
  }

  for (const button of root.querySelectorAll('[data-chili-series]')) {
    const bars = root.querySelector(`[data-chili-bars='${button.dataset.chiliSeries}']`);
    button.addEventListener(
      'click',
      () => {
        const visible = button.getAttribute('aria-pressed') === 'false';
        button.setAttribute('aria-pressed', String(visible));
        bars.classList.toggle('is-muted', !visible);
      },
      { signal },
    );
  }

  for (const button of root.querySelectorAll('[data-chili-camera-step]')) {
    button.addEventListener(
      'click',
      () => {
        cameraIndex =
          (cameraIndex + Number(button.dataset.chiliCameraStep) + cameraLabels.length) %
          cameraLabels.length;
        camera.dataset.chiliCamera = String(cameraIndex);
        cameraCaption.textContent = `监控${cameraIndex + 1}：${cameraLabels[cameraIndex]}`;
      },
      { signal },
    );
  }

  return {
    update(reading) {
      for (const value of readings) {
        const nextValue = reading[value.dataset.chiliReading];
        if (nextValue != null) value.textContent = String(nextValue);
      }

      if (Number.isFinite(reading.growth)) {
        const value = Math.min(100, Math.max(0, reading.growth));
        growthValue.textContent = value.toFixed(1);
        growth.setAttribute('aria-valuenow', String(value));
        growthProgress.setAttribute('stroke-dasharray', `${value} 100`);
      }

      if (reading.status != null) status.textContent = reading.status;
      if (reading.stage != null) stage.textContent = reading.stage;
      reading.switches?.forEach((enabled, index) => {
        if (typeof enabled === 'boolean' && switches[index]) setSwitch(switches[index], enabled);
      });
    },
  };
}
