/* SPDX-License-Identifier: MIT */
const wirePaths = new Map();

function berryWire(meridians) {
  if (wirePaths.has(meridians)) return wirePaths.get(meridians);
  const path = new Path2D();
  // Project the front hemisphere of a tilted berry; all fruits reuse these unit paths.
  for (let j = 1 - meridians; j < meridians; j++) {
    const angle = (j * Math.PI) / (2 * meridians);
    const sin = Math.sin(angle);
    const cos = Math.cos(angle);
    for (let k = 0; k <= 16; k++) {
      const lat = (k / 16 - 0.5) * Math.PI;
      const x = sin * Math.cos(lat);
      const y = -0.86 * Math.sin(lat) + 0.14 * cos * Math.cos(lat);
      if (k === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    }
    path.moveTo(cos, -0.86 * sin);
    path.ellipse(0, -0.86 * sin, cos, cos * 0.14, 0, 0, Math.PI);
  }
  wirePaths.set(meridians, path);
  return path;
}

// The optical fallback projects the same branching structure and berries as the GPU scene.
export function paintPlate(
  ctx,
  model,
  project,
  { width, height, scan, stage, scale, clock, picked, optical, growth },
) {
  ctx.clearRect(0, 0, width, height);
  const screen = project;
  const line = (points, stroke, weight, closed = false, fill = null) => {
    if (!points.length) return;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    if (closed) ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    ctx.strokeStyle = stroke;
    ctx.lineWidth = weight;
    ctx.stroke();
  };
  const seed = model.fruits[0].top.clone();
  const axisDepth = project(seed.set(0, 2.54, 0)).z;
  ctx.lineWidth = 1;
  for (const [r, alpha] of [
    [2.06, 0.22],
    [1.89, 0.63],
    [1.75, 0.32],
    [1.42, 0.22],
  ]) {
    const coords = [];
    for (let i = 0; i <= 90; i++) {
      const a = (i * Math.PI) / 45;
      coords.push(screen(seed.set(Math.cos(a) * r, -0.43, Math.sin(a) * r)));
    }
    ctx.setLineDash(r === 1.75 ? [2, 3] : []);
    line(coords, 'rgba(112,203,159,' + alpha * (scan ? 0.18 : 1) + ')', 1, true);
  }
  ctx.setLineDash([]);
  const draws = [];
  for (const { points, r, kind } of model.parts) {
    if (scan && kind === 1) continue;
    const poly = points.map(screen);
    draws.push({
      z: poly[Math.floor(poly.length / 2)].z,
      paint() {
        if (kind === 3) {
          ctx.fillStyle = scan ? '#6eafbc' : '#e6b953';
          for (let j = 0; j < 5; j++) {
            const a = j * Math.PI * 0.4,
              p = poly[0];
            ctx.beginPath();
            ctx.ellipse(
              p.x + Math.cos(a) * r * scale * 0.38,
              p.y + Math.sin(a) * r * scale * 0.38,
              r * scale * 0.43,
              r * scale * 0.13,
              a,
              0,
              Math.PI * 2,
            );
            ctx.fill();
          }
        } else {
          const weight = Math.max(0.55, 2 * r * scale);
          line(poly, kind === 1 ? '#707a48' : scan ? '#3f7e99' : '#50733c', weight);
          if (weight > 2) line(poly, scan ? '#a5e6ec' : '#94a866', weight * 0.25);
        }
      },
    });
  }
  for (const leaf of model.leaves) {
    const outline = leaf.outline.filter((_, i) => i % 2 === 0).map(screen),
      rib = leaf.middle.map(screen),
      depth = screen(leaf.depth).z;
    draws.push({
      z: depth,
      paint() {
        const color = scan ? '#376078' : '#4a7440',
          shade = scan ? '#10293f' : '#213c30';
        const last = rib[rib.length - 1],
          g = ctx.createLinearGradient(rib[0].x, rib[0].y, last.x, last.y);
        g.addColorStop(0, shade);
        g.addColorStop(0.57, color);
        g.addColorStop(1, shade);
        line(outline, scan ? '#88b7c8' : '#829b57', 0.65, true, g);
        if (scan && optical) {
          const head = rib[rib.length - 1],
            foot = rib[0],
            yMid = Math.floor(leaf.middle.length / 2);
          const l = screen(leaf.outline[yMid]),
            r = screen(leaf.outline[leaf.outline.length - yMid - 1]);
          const dx = (r.x - l.x) * 1.13,
            dy = (r.y - l.y) * 1.13,
            sw = optical.width / 2,
            sh = optical.height;
          ctx.save();
          ctx.clip();
          // Grazing light picks out the upper canopy. The same atlas recedes on rear leaflets.
          ctx.globalAlpha = Math.min(
            1,
            Math.max(0.36, 0.64 + leaf.depth.y * 0.053 + (axisDepth - depth) * 6.5),
          );
          ctx.transform(
            dx / sw,
            dy / sw,
            (foot.x - head.x) / sh,
            (foot.y - head.y) / sh,
            head.x - dx * 0.5,
            head.y - dy * 0.5,
          );
          ctx.drawImage(optical, leaf.tile * sw, 0, sw, sh, 0, 0, sw, sh);
          ctx.restore();
          return;
        }
        line(rib, scan ? '#bcdae4' : '#aec17a', 0.85);
        for (let i = 4; i < rib.length - 5; i += 4) {
          const p = rib[i],
            l = screen(leaf.outline[i + 4]),
            r = screen(leaf.outline[leaf.outline.length - i - 5]);
          line([l, p, r], scan ? '#7095ab' : '#64864b', 0.62);
        }
      },
    });
  }
  model.fruits.forEach((f, i) => {
    const c = screen(seed.copy(f.center).sub(f.top).multiplyScalar(growth).add(f.top)),
      r = f.radius * scale * growth;
    draws.push({
      z: c.z - 0.002,
      paint() {
        const hue = Math.max(7, 87 - (f.age + (stage - 2) * 0.58) * 86);
        const g = ctx.createRadialGradient(c.x - r * 0.38, c.y - r * 0.48, 0, c.x, c.y, r);
        const red = i === model.fruits.length - 1 && stage > 1;
        if (scan) {
          g.addColorStop(0, red ? '#e4b8aa' : '#a1dfed');
          g.addColorStop(0.24, red ? '#9d4143' : '#377797');
          g.addColorStop(0.65, red ? '#481e2c' : '#102a45');
          g.addColorStop(1, red ? '#914648' : '#2c5e70');
        } else
          for (const [t, l] of [
            [0, 79],
            [0.16, 63],
            [0.45, 50],
            [0.82, 32],
            [1, 18],
          ])
            g.addColorStop(t, 'hsl(' + hue + ',74%,' + l + '%)');
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, r, r * 0.86, 0, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
        ctx.strokeStyle =
          i === picked ? '#e8f6ba' : scan ? (red ? '#f0b5ac' : '#9edee9') : '#8d8a55';
        ctx.lineWidth = 0.95;
        ctx.stroke();
        if (scan) {
          ctx.save();
          ctx.clip();
          ctx.strokeStyle = 'rgba(153,219,241,' + (0.47 + 0.045 * Math.sin(clock + i)) + ')';
          ctx.translate(c.x, c.y);
          ctx.scale(r, r);
          ctx.lineWidth = 0.6 / r;
          ctx.stroke(berryWire(r < 14 ? 4 : 8));
          ctx.restore();
        }
        const tip = screen(f.top);
        ctx.fillStyle = scan ? '#9cdce0' : '#709352';
        for (let j = 0; j < 5; j++) {
          const a = j * Math.PI * 0.4 + 0.22;
          ctx.beginPath();
          ctx.moveTo(tip.x, tip.y - 1);
          ctx.lineTo(tip.x + Math.cos(a + 0.23) * r * 0.28, tip.y + Math.sin(a + 0.23) * r * 0.16);
          ctx.quadraticCurveTo(
            tip.x + Math.cos(a) * r * 0.68,
            tip.y - r * 0.22,
            tip.x + Math.cos(a) * r * 0.71,
            tip.y + (Math.sin(a) > 0.5 ? 0.35 : -0.72) * r,
          );
          ctx.quadraticCurveTo(tip.x + Math.cos(a) * r * 0.4, tip.y - r * 0.25, tip.x, tip.y);
          ctx.closePath();
          ctx.fill();
        }
      },
    });
  });
  draws.sort((a, b) => b.z - a.z);
  for (const d of draws) d.paint();
}
