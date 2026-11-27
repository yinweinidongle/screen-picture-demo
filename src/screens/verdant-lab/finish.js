/* SPDX-License-Identifier: MIT */
const ns = 'http://www.w3.org/2000/svg';
const fascia = { w: 2172, h: 154 };
const bezel = { w: 724, h: 543 };
const phases = {
  mast: 1.35,
  irrigation: 2.9,
  trade: 6.3,
  climate: 0.38,
  inspection: 7.4,
  specimen: 5.2,
};
let serial = 0;

function element(parent, tag, attributes) {
  const el = document.createElementNS(ns, tag);
  for (const [key, value] of Object.entries(attributes)) el.setAttribute(key, value);
  parent.append(el);
  return el;
}

function mapFrame(w, h, head) {
  if (head) {
    const inset = w < 580 ? 120 : 0;
    const span = fascia.w - 2 * inset;
    const left = [
      [24, 124],
      [447, 125],
      [476, 129],
      [518, 132],
      [1086, 132],
    ];
    const pixel = ([x, y]) => [((x - inset) * w) / span, (y * h) / fascia.h];
    return {
      tiles: [[inset, 0, span, fascia.h, 0, 0, w, h]],
      paths: [left.map(pixel), left.map(([x, y]) => pixel([fascia.w - x, y]))],
    };
  }
  // Corners retain their aspect ratio; only the straight stock between them stretches.
  const cut = 62;
  const m = Math.min(w / 4, h / 4, Math.max(19, Math.min(25, w * 0.068)));
  const xx = [0, cut, bezel.w - cut, bezel.w],
    yy = [0, cut, bezel.h - cut, bezel.h];
  const dx = [0, m, w - m, w],
    dy = [0, m, h - m, h];
  const tiles = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      if (row === 1 && col === 1) continue;
      tiles.push([
        xx[col],
        yy[row],
        xx[col + 1] - xx[col],
        yy[row + 1] - yy[row],
        dx[col],
        dy[row],
        dx[col + 1] - dx[col],
        dy[row + 1] - dy[row],
      ]);
    }
  }
  // All eight mitre endpoints fall inside the four fixed corner tiles.
  const f = m / cut;
  const top = 23 * f,
    left = 20.5 * f,
    right = w - 21 * f,
    bottom = h - 23 * f;
  const path = [
    [43.5 * f, top],
    [w - 45 * f, top],
    [right, 47.5 * f],
    [right, h - 47.5 * f],
    [w - 44.5 * f, bottom],
    [44 * f, bottom],
    [left, h - 46.5 * f],
    [left, 47.5 * f],
    [43.5 * f, top],
  ];
  return { tiles, paths: [path] };
}

function paintTiles(parent, atlas, tiles, offset) {
  for (const [sx, sy, sw, sh, x, y, width, height] of tiles) {
    const tile = element(parent, 'svg', {
      x,
      y,
      width,
      height,
      viewBox: [sx, sy + offset, sw, sh].join(' '),
      preserveAspectRatio: 'none',
      overflow: 'hidden',
    });
    element(tile, 'use', { href: '#' + atlas });
  }
}

function illuminate(svg, id, paths, tiles, atlas, head) {
  const defs = element(svg, 'defs', {});
  const grad = element(defs, 'radialGradient', { id: id + '-focus' });
  for (const [offset, alpha] of [
    [0, 1],
    [0.36, 1],
    [0.7, 0.5],
    [1, 0],
  ])
    element(grad, 'stop', { offset, 'stop-color': 'white', 'stop-opacity': alpha });
  const mask = element(defs, 'mask', {
    id: id + '-light',
    maskUnits: 'userSpaceOnUse',
    x: 0,
    y: 0,
    width: '100%',
    height: '100%',
  });
  const cycle = head ? 7.6 : 9.7,
    travel = head ? 0.69 : 0.49;
  for (const [i, points] of paths.entries()) {
    const path = 'M' + points.map((p) => p.join(' ')).join('L');
    const radius = head ? Math.min(54, Math.max(19, svg.clientWidth * 0.032)) : 23;
    // Reveal the extracted optical fiber, including its original local colour and baked bloom.
    // Each follower enters bends a little later than the core; the rest interval leaves the chart quiet.
    for (const [lag, gain, spread] of [
      [0.26, 0.22, 1.45],
      [0.16, 0.44, 1.35],
      [0.08, 0.69, 1.12],
      [0, 1, 1],
    ]) {
      const spot = element(mask, 'circle', {
        r: radius * spread,
        fill: 'url(#' + id + '-focus)',
        opacity: 0,
      });
      const loop = {
        begin: lag + i * 0.31 + 's',
        dur: cycle + 's',
        repeatCount: 'indefinite',
        calcMode: 'linear',
      };
      element(spot, 'animateMotion', {
        ...loop,
        path,
        keyTimes: '0;' + travel + ';1',
        keyPoints: '0;1;1',
      });
      element(spot, 'animate', {
        ...loop,
        attributeName: 'opacity',
        keyTimes: [0, 0.022, travel - 0.045, travel, 1].join(';'),
        values: [0, gain, gain, 0, 0].join(';'),
      });
    }
  }
  paintTiles(
    element(svg, 'g', { mask: 'url(#' + id + '-light)' }),
    atlas,
    tiles,
    head ? fascia.h : bezel.h,
  );
}

export function mountFinish(shell, { fasciaUrl, bezelUrl }) {
  const key = 'verdant-finish-' + ++serial;
  const library = element(shell, 'svg', {
    width: 0,
    height: 0,
    class: 'finish-library',
    'aria-hidden': 'true',
    focusable: 'false',
  });
  const defs = element(library, 'defs', {});
  for (const [name, url, art] of [
    ['fascia', fasciaUrl, fascia],
    ['bezel', bezelUrl, bezel],
  ])
    element(defs, 'image', { id: key + '-' + name, href: url, width: art.w, height: 2 * art.h });
  const frames = new Map();
  let playing = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  function sync(frame) {
    if (playing && frame.visible && !document.hidden) frame.svg.unpauseAnimations();
    else frame.svg.pauseAnimations();
  }
  function size(frame) {
    const { svg, name } = frame;
    const w = svg.clientWidth,
      h = svg.clientHeight;
    if (!w || !h || (w === frame.w && h === frame.h)) return;
    const t = frame.w ? svg.getCurrentTime() : phases[name] || 0;
    frame.w = w;
    frame.h = h;
    svg.replaceChildren();
    svg.setAttribute('viewBox', [0, 0, w, h].join(' '));
    const head = name === 'mast',
      atlas = key + '-' + (head ? 'fascia' : 'bezel');
    const { tiles, paths } = mapFrame(w, h, head);
    paintTiles(svg, atlas, tiles, 0);
    illuminate(svg, key + '-' + name, paths, tiles, atlas, head);
    svg.setCurrentTime(t);
    sync(frame);
  }
  const resize = new ResizeObserver((entries) => {
    for (const { target } of entries) size(frames.get(target));
  });
  const visible = new IntersectionObserver((entries) => {
    for (const { target, isIntersecting } of entries) {
      const frame = frames.get(target);
      frame.visible = isIntersecting;
      sync(frame);
    }
  });
  for (const host of shell.querySelectorAll('[data-finish]')) {
    const name = host.dataset.finish;
    const svg = element(host, 'svg', {
      class: 'verdant-hardware',
      'aria-hidden': 'true',
      focusable: 'false',
      preserveAspectRatio: 'none',
      'data-circuit': name,
    });
    const frame = { svg, name, visible: true, w: 0, h: 0 };
    frames.set(host, frame);
    size(frame);
    resize.observe(host);
    visible.observe(host);
  }
  const update = () => frames.forEach(sync);
  document.addEventListener('visibilitychange', update);
  return {
    play(value) {
      playing = Boolean(value);
      update();
    },
    pulse(name) {
      if (!playing || document.hidden) return;
      for (const frame of frames.values())
        if (frame.visible && frame.name === name) frame.svg.setCurrentTime(0.23);
    },
    dispose() {
      resize.disconnect();
      visible.disconnect();
      document.removeEventListener('visibilitychange', update);
      for (const { svg } of frames.values()) svg.remove();
      library.remove();
    },
  };
}
