/* SPDX-License-Identifier: MIT */
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
          line(poly, kind === 1 ? '#707a48' : scan ? '#407f79' : '#50733c', weight);
          if (weight > 2) line(poly, scan ? '#74bcb0' : '#94a866', weight * 0.32);
        }
      },
    });
  }
  for (const leaf of model.leaves) {
    const outline = leaf.outline.filter((_, i) => i % 2 === 0).map(screen),
      rib = leaf.middle.map(screen);
    draws.push({
      z: screen(leaf.depth).z,
      paint() {
        const color = scan ? '#386371' : '#3d703e',
          shade = scan ? '#173b3e' : '#23452b';
        const last = rib[rib.length - 1],
          g = ctx.createLinearGradient(rib[0].x, rib[0].y, last.x, last.y);
        g.addColorStop(0, shade);
        g.addColorStop(0.57, color);
        g.addColorStop(1, shade);
        line(outline, scan ? '#75b7a9' : '#829b57', 0.65, true, g);
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
        line(rib, scan ? '#aed2b6' : '#aec17a', 0.85);
        for (let i = 4; i < rib.length - 5; i += 4) {
          const p = rib[i],
            l = screen(leaf.outline[i + 4]),
            r = screen(leaf.outline[leaf.outline.length - i - 5]);
          line([l, p, r], scan ? '#689e93' : '#64864b', 0.62);
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
        if (scan) {
          const red = i === model.fruits.length - 1 && stage > 1;
          g.addColorStop(0, red ? '#b58184' : '#78b7bf');
          g.addColorStop(0.25, red ? '#672d38' : '#305664');
          g.addColorStop(0.67, red ? '#391520' : '#102433');
          g.addColorStop(1, red ? '#783a3d' : '#233c51');
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
        ctx.strokeStyle = i === picked ? '#d3f2b8' : scan ? '#97c7b3' : '#8d8a55';
        ctx.lineWidth = 0.95;
        ctx.stroke();
        if (scan) {
          ctx.save();
          ctx.clip();
          ctx.strokeStyle =
            'rgba(138,206,227,' + (0.18 + 0.065 * Math.sin(clock * 1.2 + i * 0.55)) + ')';
          ctx.lineWidth = 0.65;
          for (let j = 1; j < 5; j++) {
            ctx.beginPath();
            ctx.ellipse(c.x, c.y, (r * j) / 5, r * 0.86, 0, 0, Math.PI * 2);
            ctx.stroke();
          }
          for (let j = -3; j <= 3; j++) {
            ctx.beginPath();
            ctx.ellipse(
              c.x,
              c.y + r * j * 0.21,
              r * Math.sqrt(1 - j * j * 0.04),
              r * 0.072,
              0,
              0,
              Math.PI * 2,
            );
            ctx.stroke();
          }
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
