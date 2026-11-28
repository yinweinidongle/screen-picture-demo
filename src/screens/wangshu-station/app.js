import { createRenderer } from './renderer.js';
import {
  cameraShots,
  FILM_DURATION,
  RUN_LENGTH,
  STOP_TIME,
  MATERIAL_START,
  MATERIAL_END,
  shotAt,
  telemetryAt,
} from './sequence.js';

const $ = (id) => document.getElementById(id);
const station = $('station');
const seek = $('seek'),
  play = $('play'),
  sound = $('sound'),
  orbit = $('orbit'),
  panels = $('panels');
const elapsed = $('elapsed');
const cameraMenu = $('camera-menu');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const compact = matchMedia('(max-width:700px), (max-height:520px)');
const params = new URLSearchParams(location.search);
const hold = params.has('t') && Number.isFinite(Number(params.get('t')));
const bound = (t) => Math.min(FILM_DURATION, Math.max(0, t));
let time = hold ? bound(Number(params.get('t'))) : 6.6;
let playing = !reduced.matches && !hold,
  free = false,
  audible = false,
  disposed = false;
let engine,
  frame = 0,
  lastStamp = null,
  dirty = true,
  lastHud = -1;
let presentationReady = false;
let contextLost = false;
const lifecycle = new AbortController();
const track = new Audio();
track.preload = 'none';
track.loop = true;
const shotButtons = cameraShots.map((shot, i) => {
  const b = document.createElement('button');
  b.type = 'button';
  const number = document.createElement('span');
  number.textContent = String(i + 1).padStart(2, '0');
  b.append(number, document.createTextNode(shot.name));
  b.setAttribute('aria-label', '切换至' + shot.name);
  b.onclick = () => {
    setFree(false);
    seekTo(shot.from);
    closeMenu();
  };
  $('shots').append(b);
  return b;
});
function value(el, text) {
  if (el.textContent !== text) el.textContent = text;
}
function control(button, key, label, pressed) {
  button.querySelector('use')?.setAttribute('href', '#i-' + key);
  button.setAttribute('aria-label', label);
  button.title = label;
  if (pressed !== undefined) button.setAttribute('aria-pressed', String(pressed));
}
function playLabel() {
  control(play, playing ? 'pause' : 'play', playing ? '暂停' : '播放');
}
function showPanels(visible) {
  $('instruments').hidden = !visible;
  control(panels, 'panels', visible ? '收起仪表' : '展开仪表', visible);
  if (presentationReady) renderHud();
}
showPanels(!compact.matches);
compact.addEventListener('change', () => showPanels(!compact.matches), {
  signal: lifecycle.signal,
});
panels.onclick = () => showPanels($('instruments').hidden);

const plotX = (t) => 2 + (246 * t) / FILM_DURATION;
const plotY = (v) => 59 - (54 * v) / 50;
const curve = Array.from({ length: 97 }, (_, i) => {
  const t = (i * FILM_DURATION) / 96;
  return (i ? 'L' : 'M') + plotX(t).toFixed(2) + ' ' + plotY(telemetryAt(t).speed).toFixed(2);
}).join(' ');
$('velocity-curve').setAttribute('d', curve);
$('curve-area').setAttribute('d', curve + ' L248 59H2Z');
function closeMenu(returnFocus = true) {
  if (!cameraMenu.open) return;
  cameraMenu.open = false;
  if (returnFocus) cameraMenu.querySelector('summary').focus();
}
document.addEventListener(
  'pointerdown',
  (event) => {
    if (cameraMenu.open && !cameraMenu.contains(event.target)) closeMenu(false);
  },
  { signal: lifecycle.signal },
);
cameraMenu.addEventListener('focusout', (event) => {
  if (event.relatedTarget && !cameraMenu.contains(event.relatedTarget)) closeMenu(false);
});
const peak = telemetryAt(STOP_TIME / 2).deceleration;
value($('peak-brake'), peak.toFixed(2));
value($('scan-interval'), MATERIAL_START.toFixed(2) + ' – ' + MATERIAL_END.toFixed(2) + ' s');
const barCount = 26;
const brakeBars = Array.from({ length: barCount }, (_, index) => {
  const t = ((index + 0.5) * FILM_DURATION) / barCount;
  const amount = telemetryAt(t).deceleration / peak;
  const height = Math.max(2, amount * 44);
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', 2 + index * (248 / barCount));
  rect.setAttribute('width', 6.1);
  rect.setAttribute('y', 51 - height);
  rect.setAttribute('height', height);
  rect.setAttribute('rx', '1');
  $('brake-bars').append(rect);
  return rect;
});
const dashboard = {
  speed: $('speed'),
  travelled: $('travelled'),
  remaining: $('remaining'),
  scan: $('scan'),
  ring: $('scan-ring'),
  train: $('train-pin'),
  journey: $('journey-line'),
  trackProgress: $('track-progress'),
  dot: $('curve-dot'),
  cursor: $('curve-cursor'),
  motion: $('motion'),
  brake: $('deceleration'),
  phases: [...$('phases').children],
};
function clock(t) {
  return '00:' + t.toFixed(1).padStart(4, '0');
}
function renderHud() {
  const { speed, travelled, remaining, scan, deceleration } = telemetryAt(time);
  const shot = shotAt(time),
    index = cameraShots.indexOf(shot);
  value(dashboard.speed, speed.toFixed(1));
  value(dashboard.travelled, travelled.toFixed(1));
  value(dashboard.remaining, remaining.toFixed(1));
  value(dashboard.scan, Math.round(scan * 100) + '%');
  value(dashboard.motion, time >= STOP_TIME ? '已停稳' : '进站中');
  value(dashboard.brake, deceleration.toFixed(2));
  const trackFraction = travelled / RUN_LENGTH;
  const pin = 9 + 231 * trackFraction;
  dashboard.train.setAttribute('transform', 'translate(' + pin.toFixed(2) + ' 39)');
  dashboard.journey.setAttribute('d', 'M9 39H' + pin.toFixed(2));
  value(dashboard.trackProgress, Math.round(trackFraction * 100) + '%');
  dashboard.ring.style.strokeDashoffset = String(100 - scan * 100);
  const activePhase = time < MATERIAL_START ? 0 : time < MATERIAL_END ? 1 : 2;
  dashboard.phases.forEach((phase, i) => {
    phase.dataset.state = i < activePhase ? 'done' : i === activePhase ? 'active' : 'upcoming';
  });
  const bin = Math.min(barCount - 1, Math.floor((time * barCount) / FILM_DURATION));
  brakeBars.forEach((bar, i) => {
    bar.setAttribute('class', i === bin ? 'current' : i < bin ? 'passed' : 'upcoming');
  });
  const x = plotX(time).toFixed(2),
    y = plotY(speed).toFixed(2);
  dashboard.dot.setAttribute('cx', x);
  dashboard.dot.setAttribute('cy', y);
  dashboard.cursor.setAttribute('d', 'M' + x + ' 5V59');
  seek.value = time;
  seek.setAttribute('aria-valuetext', time.toFixed(1) + ' 秒');
  value(elapsed, clock(time));
  shotButtons.forEach((button, i) =>
    button.setAttribute('aria-pressed', String(!free && i === index)),
  );
}
function syncAudio() {
  if (!audible || !playing || document.hidden || !presentationReady) {
    track.pause();
    return;
  }
  if (track.readyState && Math.abs(track.currentTime - time) > 0.16) track.currentTime = time;
  if (track.paused)
    track.play().catch(() => {
      if (!audible || !playing || document.hidden || disposed) return;
      audible = false;
      control(sound, 'mute', '打开环境音', false);
      value($('render-status'), '环境音暂不可用');
    });
}
function requestFrame() {
  if (!frame && !disposed && !document.hidden) frame = requestAnimationFrame(tick);
}
function invalidate() {
  dirty = true;
  requestFrame();
}
function tick(stamp) {
  frame = 0;
  if (disposed || document.hidden) return;
  if (playing && presentationReady) {
    if (lastStamp !== null) {
      time += Math.max(0, stamp - lastStamp) / 1000;
      if (time >= FILM_DURATION) {
        time %= FILM_DURATION;
        syncAudio();
      }
    }
    lastStamp = stamp;
  }
  if (dirty || playing) {
    engine?.draw(time, stamp);
    if (dirty || stamp - lastHud >= 85) {
      renderHud();
      lastHud = stamp;
    }
    dirty = false;
  }
  if (playing && presentationReady) requestFrame();
}
function setPlaying(enabled) {
  if (enabled && time >= FILM_DURATION) time = 0;
  playing = enabled;
  lastStamp = null;
  playLabel();
  syncAudio();
  invalidate();
}
function seekTo(t) {
  time = bound(Number(t) || 0);
  lastStamp = null;
  if (track.readyState) track.currentTime = time;
  syncAudio();
  renderHud();
  invalidate();
}
function setFree(enabled) {
  if (free === enabled || !engine) return;
  if (enabled) setPlaying(false);
  free = enabled;
  engine.setFree(enabled);
  orbit.setAttribute('aria-pressed', String(free));
  value(orbit.querySelector('span'), free ? '返回运镜' : '自由观察');
  renderHud();
  invalidate();
}
orbit.onclick = () => {
  setFree(!free);
  closeMenu();
};
play.onclick = () => {
  if (free) setFree(false);
  setPlaying(!playing);
};
let resumeScrub = false;
seek.addEventListener('pointerdown', () => {
  resumeScrub = playing;
  setPlaying(false);
});
seek.addEventListener('input', () => {
  setFree(false);
  if (playing) setPlaying(false);
  seekTo(seek.value);
});
function endScrub() {
  if (resumeScrub && time < FILM_DURATION) setPlaying(true);
  resumeScrub = false;
}
seek.addEventListener('change', endScrub);
window.addEventListener('pointerup', endScrub, { signal: lifecycle.signal });
window.addEventListener('pointercancel', endScrub, { signal: lifecycle.signal });
sound.onclick = () => {
  audible = !audible;
  if (audible && !track.getAttribute('src')) track.src = station.dataset.audio;
  track.volume = 0.6;
  control(sound, audible ? 'sound' : 'mute', audible ? '关闭环境音' : '打开环境音', audible);
  syncAudio();
};
track.addEventListener(
  'loadedmetadata',
  () => {
    track.currentTime = time;
    syncAudio();
  },
  { signal: lifecycle.signal },
);
const full = $('fullscreen');
full.hidden = !document.fullscreenEnabled;
full.onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await station.requestFullscreen();
  } catch {
    value($('render-status'), '当前窗口不支持全屏');
  }
};
document.addEventListener(
  'fullscreenchange',
  () => {
    control(
      full,
      document.fullscreenElement ? 'exit-full' : 'full',
      document.fullscreenElement ? '退出全屏' : '进入全屏',
    );
  },
  { signal: lifecycle.signal },
);
document.addEventListener(
  'keydown',
  (event) => {
    if (event.key === 'Escape' && cameraMenu.open) {
      closeMenu();
      return;
    }
    if (event.key === 'Escape' && free) {
      setFree(false);
      return;
    }
    if (
      event.target.closest?.('input,button,a,summary') ||
      event.altKey ||
      event.metaKey ||
      event.ctrlKey
    )
      return;
    if (event.code === 'Space') {
      event.preventDefault();
      play.click();
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      setFree(false);
      setPlaying(false);
      seekTo(time + (event.key === 'ArrowRight' ? 0.25 : -0.25));
    }
  },
  { signal: lifecycle.signal },
);
document.addEventListener(
  'visibilitychange',
  () => {
    lastStamp = null;
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
    } else invalidate();
    syncAudio();
  },
  { signal: lifecycle.signal },
);
reduced.addEventListener(
  'change',
  () => {
    if (reduced.matches) setPlaying(false);
  },
  { signal: lifecycle.signal },
);
function fallback() {
  free = false;
  orbit.disabled = true;
  orbit.setAttribute('aria-pressed', 'false');
  value(orbit.querySelector('span'), '自由观察');
  station.dataset.renderer = 'fallback';
  value($('render-status'), '静态场景 · 仪表可交互');
  presentationReady = true;
  syncAudio();
  invalidate();
}
$('scene').addEventListener(
  'webglcontextlost',
  (event) => {
    if (disposed || contextLost) return;
    event.preventDefault();
    contextLost = true;
    engine?.dispose();
    engine = null;
    fallback();
  },
  { capture: true, signal: lifecycle.signal },
);
window.VizLabRuntime.onDispose(() => {
  disposed = true;
  lifecycle.abort();
  cancelAnimationFrame(frame);
  track.pause();
  track.removeAttribute('src');
  track.load();
  engine?.dispose();
});
playLabel();
renderHud();
createRenderer($('scene'), station.dataset, lifecycle.signal, invalidate)
  .then((result) => {
    if (disposed || contextLost) {
      result.dispose();
      return;
    }
    engine = result;
    engine.draw(time, performance.now());
    station.dataset.renderer = 'webgl';
    value($('render-status'), '');
    orbit.disabled = false;
    presentationReady = true;
    lastStamp = null;
    syncAudio();
    invalidate();
  })
  .catch((error) => {
    if (disposed) return;
    console.warn('望舒站三维场景无法渲染', error);
    engine?.dispose();
    engine = null;
    fallback();
  });
