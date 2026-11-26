/* SPDX-License-Identifier: MIT */
const svgNS = 'http://www.w3.org/2000/svg';
function node(parent, tag, attributes = {}) {
  const el = document.createElementNS(svgNS, tag);
  for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
  parent.append(el);
  return el;
}

// The coordinates are sampled from the generated artwork, in atlas pixels.
// Both rows use the same slices: the upper row is the plate, the lower its luminous inlay.
const fascia = { w: 2172, h: 194 };
const bezel = { w: 724, h: 543, cutX: 76, cutY: 62 };
const rim = [
  [39.5, 23.5],
  [684, 23.5],
  [708.5, 48.5],
  [708.5, 490],
  [684, 514.5],
  [39.5, 514.5],
  [15, 490],
  [15, 48.5],
  [39.5, 23.5],
];
const wing = [
  [450, 148],
  [630, 148],
  [679, 170],
  [1086, 170],
];

function project(value, source, destination) {
  const i = value <= source[1] ? 0 : value >= source[2] ? 2 : 1;
  return (
    destination[i] +
    ((value - source[i]) / (source[i + 1] - source[i])) * (destination[i + 1] - destination[i])
  );
}

function layoutFrame(width, height, isMast, corner) {
  if (isMast) {
    // The narrow layout keeps the central plaque and the ends of both light channels.
    const crop = width <= 600 ? 398 : width < 960 ? 205 : 0;
    const srcWidth = fascia.w - 2 * crop;
    const map = (points) =>
      points.map(([x, y]) => [((x - crop) * width) / srcWidth, (y * height) / fascia.h]);
    return {
      slices: [[crop, 0, srcWidth, fascia.h, 0, 0, width, height]],
      routes: [map(wing), map(wing.map(([x, y]) => [fascia.w - x, y]))],
    };
  }
  const mx = Math.min(corner, width / 4),
    my = Math.min((mx * bezel.cutY) / bezel.cutX, height / 3);
  const xs = [0, bezel.cutX, bezel.w - bezel.cutX, bezel.w],
    ys = [0, bezel.cutY, bezel.h - bezel.cutY, bezel.h];
  const dx = [0, mx, width - mx, width],
    dy = [0, my, height - my, height];
  const slices = [];
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      if (x !== 1 || y !== 1)
        slices.push([
          xs[x],
          ys[y],
          xs[x + 1] - xs[x],
          ys[y + 1] - ys[y],
          dx[x],
          dy[y],
          dx[x + 1] - dx[x],
          dy[y + 1] - dy[y],
        ]);
    }
  }
  return { slices, routes: [rim.map(([x, y]) => [project(x, xs, dx), project(y, ys, dy)])] };
}

function skin(parent, atlas, slices, offset) {
  for (const [sx, sy, sw, sh, x, y, width, height] of slices) {
    const viewport = node(parent, 'svg', {
      x,
      y,
      width,
      height,
      viewBox: [sx, sy + offset, sw, sh].join(' '),
      preserveAspectRatio: 'none',
      overflow: 'hidden',
    });
    node(viewport, 'use', { href: '#' + atlas });
  }
}

function beam(mask, path, gradient, duration, travel, radius) {
  // Each follower samples the same path slightly later, including through the mitred corners.
  for (const [delay, opacity, scale] of [
    [0.21, 0.28, 1.38],
    [0.14, 0.45, 1.28],
    [0.075, 0.72, 1.16],
    [0, 1, 1],
  ]) {
    const tip = node(mask, 'circle', {
      r: radius * scale,
      fill: 'url(#' + gradient + ')',
      opacity: 0,
    });
    const timing = {
      begin: delay + 's',
      dur: duration + 's',
      repeatCount: 'indefinite',
      calcMode: 'linear',
    };
    const motion = node(tip, 'animateMotion', {
      ...timing,
      keyPoints: '0;1;1',
      keyTimes: '0;' + travel + ';1',
    });
    node(motion, 'mpath', { href: '#' + path });
    node(tip, 'animate', {
      ...timing,
      attributeName: 'opacity',
      keyTimes: '0;.025;' + (travel - 0.055) + ';' + travel + ';1',
      values: [0, opacity, opacity, 0, 0].join(';'),
    });
  }
}

const finishes = [
  // selector, circuit name, corner size, initial phase in seconds
  ['.mast', 'fascia', 0, 1.5],
  ['.chart-panel', 'chart', 36, 2.5],
  ['.service-panel', 'services', 36, 6.5],
  ['.hero', 'canopy', 33, 5.4],
  ['.state-panel', 'state', 36, 0.4],
  ['.feed-panel', 'feed', 36, 8.3],
  ['.metrics', '', 20, 0],
  ['.districts', '', 21, 0],
];

export function mountChrome(shell) {
  const atlasDefs = node(
    node(shell, 'svg', { class: 'material-library', 'aria-hidden': 'true', width: 0, height: 0 }),
    'defs',
  );
  for (const [name, art] of [
    ['fascia', fascia],
    ['bezel', bezel],
  ]) {
    node(atlasDefs, 'image', {
      id: 'civic-atlas-' + name,
      href: shell.dataset[name],
      width: art.w,
      height: art.h * 2,
    });
  }
  const records = new Map();
  let playing = false;
  function playback(record) {
    if (!record.name) return;
    const active = playing && !document.hidden && record.visible;
    if (active) record.svg.unpauseAnimations();
    else record.svg.pauseAnimations();
  }
  function paint(record, width, height) {
    if (width <= 0 || height <= 0 || (width === record.width && height === record.height)) return;
    const { svg, name, corner, phase } = record;
    const time = record.width ? svg.getCurrentTime() : phase;
    Object.assign(record, { width, height });
    svg.replaceChildren();
    svg.setAttribute('viewBox', [0, 0, width, height].join(' '));
    const isMast = name === 'fascia',
      art = isMast ? fascia : bezel;
    const atlas = 'civic-atlas-' + (isMast ? 'fascia' : 'bezel');
    const { slices, routes } = layoutFrame(width, height, isMast, corner);
    skin(svg, atlas, slices, 0);
    if (!name) return;
    const id = 'civic-circuit-' + name;
    const defs = node(svg, 'defs');
    const gradient = node(defs, 'radialGradient', { id: id + '-falloff' });
    for (const [offset, alpha] of [
      [0, 1],
      [0.32, 1],
      [0.64, 0.66],
      [1, 0],
    ]) {
      node(gradient, 'stop', { offset, 'stop-color': 'white', 'stop-opacity': alpha });
    }
    const mask = node(defs, 'mask', {
      id: id + '-window',
      x: 0,
      y: 0,
      width,
      height,
      maskUnits: 'userSpaceOnUse',
      'mask-type': 'alpha',
    });
    routes.forEach((line, i) => {
      const path = id + '-' + i;
      node(defs, 'path', { id: path, d: 'M' + line.map(([x, y]) => x + ' ' + y).join('L') });
      beam(
        mask,
        path,
        id + '-falloff',
        isMast ? 6.8 : 9.6,
        isMast ? 0.58 : 0.48,
        isMast ? Math.max(16, Math.min(40, width * 0.025)) : 24,
      );
    });
    skin(node(svg, 'g', { mask: 'url(#' + id + '-window)' }), atlas, slices, art.h);
    svg.setCurrentTime(time);
    playback(record);
  }
  const resize = new ResizeObserver((entries) => {
    for (const { target } of entries) {
      const data = records.get(target);
      paint(data, data.svg.clientWidth, data.svg.clientHeight);
    }
  });
  const intersection = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const record = records.get(entry.target);
      record.visible = entry.isIntersecting;
      playback(record);
    }
  });
  for (const [selector, name, corner, phase] of finishes) {
    const host = shell.querySelector(selector);
    const svg = node(host, 'svg', {
      class: 'frame-skin',
      'aria-hidden': 'true',
      focusable: 'false',
      preserveAspectRatio: 'none',
    });
    if (name) svg.dataset.circuit = name;
    const record = { svg, name, corner, phase, visible: true };
    records.set(host, record);
    paint(record, svg.clientWidth, svg.clientHeight);
    resize.observe(host);
    if (name) intersection.observe(host);
  }
  const sync = () => records.forEach(playback);
  document.addEventListener('visibilitychange', sync);
  return {
    play(value) {
      playing = value;
      sync();
    },
    pulse(name) {
      if (!playing || document.hidden) return;
      for (const r of records.values())
        if (r.name === name && r.visible) r.svg.setCurrentTime(0.22);
    },
    dispose() {
      document.removeEventListener('visibilitychange', sync);
      resize.disconnect();
      intersection.disconnect();
      for (const { svg } of records.values()) svg.remove();
      atlasDefs.parentElement.remove();
    },
  };
}
