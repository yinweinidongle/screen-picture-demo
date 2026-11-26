/* SPDX-License-Identifier: MIT */
import { hourAt } from './data.js';

function curve(points) {
  return points.reduce((d, [x, y], i) => {
    if (!i) return `M${x},${y}`;
    const [px, py] = points[i - 1],
      before = points[Math.max(0, i - 2)],
      after = points[Math.min(points.length - 1, i + 1)];
    const bound = (v) => Math.max(Math.min(py, y), Math.min(Math.max(py, y), v));
    return (
      d +
      ` C${px + (x - px) / 3},${bound(py + (y - before[1]) / 6)} ${x - (x - px) / 3},${bound(y - (after[1] - py) / 6)} ${x},${y}`
    );
  }, '');
}

export function renderFlow(svg, data, period) {
  const start = 24 - period,
    received = data.inFlow.slice(start),
    completed = data.outFlow.slice(start);
  const peak = Math.max(...received, ...completed, 1),
    interval = peak > 250 ? 100 : peak > 115 ? 50 : peak > 50 ? 25 : peak > 25 ? 10 : 5;
  const top = Math.ceil(peak / interval) * interval,
    left = 28,
    right = 296,
    y1 = 12,
    y2 = 117;
  const X = (i) => left + (i * (right - left)) / (period - 1),
    Y = (n) => y2 - ((y2 - y1) * n) / top;
  const points = (series) => series.map((n, i) => [X(i), Y(n)]);
  const incoming = curve(points(received)),
    outgoing = curve(points(completed));
  const grid = [0, 0.5, 1]
    .map(
      (t) =>
        `<path d="M${left} ${Y(t * top)}H${right}" stroke="#35505b" stroke-dasharray="2 4"/><text x="${left - 7}" y="${Y(t * top) + 3}" text-anchor="end">${Math.round(t * top)}</text>`,
    )
    .join('');
  const ticks = [0, Math.round((period - 1) / 3), Math.round(((period - 1) * 2) / 3), period - 1]
    .map(
      (k, i) =>
        `<text x="${X(k)}" y="136" text-anchor="${i === 0 ? 'start' : i === 3 ? 'end' : 'middle'}">${hourAt(start + k)}</text>`,
    )
    .join('');
  svg.innerHTML = `<defs><linearGradient id="flow-fill" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox"><stop stop-color="#66d7c8" stop-opacity=".28"/><stop offset="1" stop-color="#66d7c8" stop-opacity=".01"/></linearGradient></defs>${grid}${ticks}<path d="${incoming} L${right},${y2} H${left} Z" fill="url(#flow-fill)"/><g fill="none" stroke-linecap="round"><path d="${outgoing}" stroke="#86aeef" stroke-width="1.7" stroke-dasharray="4 4"/><path d="${incoming}" stroke="#7aebd9" stroke-width="2.2"/></g><circle cx="${right}" cy="${Y(received.at(-1))}" r="2.7" fill="#94f9e5"/><line id="cursor" y1="${y1}" y2="${y2}" stroke="#c2e7e2" stroke-dasharray="2 3" visibility="hidden"/>`;
  return { start, left, right, X };
}

export const statusColors = ['#efb46d', '#80adfa', '#78dec8'];
export function renderDonut(svg, data) {
  const parts = [
    [data.done, statusColors[2]],
    [data.active, statusColors[1]],
    [data.queued, statusColors[0]],
  ];
  let offset = 0;
  const arcs = parts
    .map(([n, color]) => {
      const share = (n / data.total) * 100;
      const result = `<circle cx="60" cy="60" r="47" pathLength="100" fill="none" stroke="${color}" stroke-width="9" stroke-dasharray="${Math.max(0, share - 1)} ${100 - Math.max(0, share - 1)}" stroke-dashoffset="${-offset}"/>`;
      offset += share;
      return result;
    })
    .join('');
  svg.innerHTML = `<g fill="none" stroke="#41606b"><circle cx="60" cy="60" r="56" pathLength="120" stroke-dasharray=".65 1.35"/><circle cx="60" cy="60" r="37" stroke="#2a424d"/></g><g transform="rotate(-90 60 60)">${arcs}</g>`;
}
export function spark(values) {
  const min = Math.min(...values),
    span = Math.max(1, Math.max(...values) - min);
  return curve(
    values.map((n, i) => [2 + (i * 78) / (values.length - 1), 28 - (23 * (n - min)) / span]),
  );
}
