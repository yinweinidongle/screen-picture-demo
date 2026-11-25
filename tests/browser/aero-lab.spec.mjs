import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const publicCar = fileURLToPath(new URL('../../assets/models/aero-aventador.glb', import.meta.url));
async function open(page) {
  await page.setViewportSize({ width: 960, height: 700 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/aero-lab.html');
  await expect(page.locator('#stage')).toHaveAttribute('data-renderer', 'webgl2');
}
async function settle(page) {
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );
}

test('paint stencil retains both finishes and draws a luminous edge at the cut', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await open(page);
  expect(Number(await page.locator('#vehicle').getAttribute('data-paint-meshes'))).toBeGreaterThan(
    0,
  );
  await page.getByRole('button', { name: '夜驰 · 动漫痛车' }).click();
  await expect(page.locator('#paint-name')).toHaveText('夜驰 · 动漫痛车');
  const samples = [];
  for (const pos of [0, 48, 100]) {
    await page.locator('#reveal').fill(String(pos));
    await settle(page);
    await expect(page.locator('#stage')).toHaveAttribute('data-reveal', String(pos));
    samples.push((await page.locator('#vehicle').screenshot()).toString('base64'));
  }
  const counts = await page.evaluate(async (encoded) => {
    const [start, mid, end] = await Promise.all(
      encoded.map(async (png) => {
        const blob = await (await fetch('data:image/png;base64,' + png)).blob();
        const image = await createImageBitmap(blob);
        const ctx = new OffscreenCanvas(image.width, image.height).getContext('2d');
        ctx.drawImage(image, 0, 0);
        image.close();
        return ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height).data;
      }),
    );
    const counts = { source: 0, destination: 0, rim: 0, portrait: 0 };
    for (let i = 0; i < mid.length; i += 4) {
      const delta = (a, b) => Math.max(...[0, 1, 2].map((k) => Math.abs(a[i + k] - b[i + k])));
      if (delta(start, end) > 45) {
        if (delta(start, mid) < 12) counts.source++;
        if (delta(end, mid) < 12) counts.destination++;
      }
      if (
        mid[i + 2] > Math.max(start[i + 2], end[i + 2]) + 37 &&
        mid[i + 1] > Math.max(start[i + 1], end[i + 1]) + 30
      )
        counts.rim++;
      // The pilot's warm skin ink distinguishes the illustrated finish from bare violet paint.
      const r = end[i],
        g = end[i + 1],
        b = end[i + 2];
      if (b > 110 && r > g * 1.035 && g >= b - 2 && r - b < 92 && b > start[i + 2] + 22)
        counts.portrait++;
    }
    return counts;
  }, samples);
  expect(counts.source).toBeGreaterThan(120);
  expect(counts.destination).toBeGreaterThan(120);
  expect(counts.rim).toBeGreaterThan(8);
  expect(counts.portrait).toBeGreaterThan(80);
  await page.getByRole('button', { name: '冰川蓝' }).click();
  await expect(page.locator('#paint-name')).toHaveText('冰川蓝');
  await page.locator('#light').click();
  await expect(page.locator('#light')).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: info.outputPath('studio.png') });
  expect(errors).toEqual([]);
});

test('wind settings, orbit presets and local GLB import stay synchronized', async ({ page }) => {
  test.setTimeout(90000);
  await open(page);
  const numericForce = async () =>
    Number((await page.locator('#force').textContent()).replaceAll(',', ''));
  const fullForce = await numericForce();
  const frontal = Number(await page.locator('#section-area').textContent());
  expect(frontal).toBeGreaterThan(1);
  expect(frontal).toBeLessThan(3);
  expect(Math.abs(fullForce - 0.5 * 1.225 * (160 / 3.6) ** 2 * 0.32 * frontal)).toBeLessThan(3);
  await page.locator('#run').click();
  await expect(page.locator('#lab')).toHaveAttribute('data-running', 'true');
  await expect(page.locator('#vehicle')).toHaveAttribute('data-line-reflection', 'wind');
  await page.locator('#speed').fill('80');
  await expect.poll(async () => Math.abs((await numericForce()) - fullForce / 4)).toBeLessThan(1);
  await page.locator('#yaw').fill('10');
  const force = await page.locator('#force').textContent();
  expect(await numericForce()).toBeGreaterThan(fullForce / 4 + 1);
  expect(Number(await page.locator('#section-area').textContent())).toBeGreaterThan(frontal);
  await page.locator('#yaw').fill('-10');
  await expect(page.locator('#force')).toHaveText(force);
  await page.locator('#run').click();
  await expect(page.locator('#bench-state')).toContainText('暂停');
  await page.locator('#end-test').click();
  await expect(page.locator('#bench-state')).toHaveText('待机');
  await expect(page.locator('#vehicle')).toHaveAttribute('data-line-reflection', 'off');
  await page.getByRole('button', { name: '正侧' }).click();
  await expect(page.locator('#vehicle')).toHaveAttribute('data-view', 'side');
  await page.locator('#vehicle').press('ArrowLeft');
  await expect(page.locator('#vehicle')).toHaveAttribute('data-view', 'custom');
  await page.locator('#vehicle').press('Home');
  await expect(page.locator('#vehicle')).toHaveAttribute('data-view', 'hero');
  await page.locator('#file').setInputFiles({
    name: 'invalid.glb',
    mimeType: 'model/gltf-binary',
    buffer: Buffer.from('invalid'),
  });
  await expect(page.locator('#message')).toContainText('载入失败');
  await expect(page.locator('#car-name')).toHaveText('AVENTADOR');
  await page.locator('#file').setInputFiles(publicCar);
  await expect(page.locator('#message')).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expect(page.locator('#vehicle')).toBeInViewport();
});

test('drive modes preserve studio settings and use the radar planner on the road', async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await open(page);
  await page.getByRole('button', { name: '正侧' }).click();
  await page.locator('#speed').fill('205');
  await page.locator('#run').click();
  await page.getByRole('button', { name: '时空隧道' }).click();
  await expect(page.locator('#lab')).toHaveAttribute('data-mode', 'tunnel');
  await expect(page.locator('#vehicle')).toHaveAttribute('data-line-reflection', 'tunnel');
  await expect(page.locator('#drive-status')).toHaveText('已暂停');
  await page.locator('#warp-speed').fill('280');
  await expect(page.locator('#warp-value')).toHaveText('280 km/h');
  await page.locator('#drive-restart').click();
  const distance = Number(await page.locator('#drive-primary').textContent());
  await page.locator('#drive-step').click();
  expect(Number(await page.locator('#drive-primary').textContent())).toBeGreaterThan(distance);
  await page.locator('#drive-restart').click();
  await expect(page.locator('#drive-primary')).toHaveText(String(distance));
  const canvas = page.locator('#vehicle'),
    box = await canvas.boundingBox();
  const aim = { x: Math.round(box.x + box.width * 0.48), y: Math.round(box.y + box.height * 0.52) };
  const crop = { x: aim.x - 45, y: aim.y - 25, width: 90, height: 50 };
  const before = await page.screenshot({ clip: crop });
  await page.mouse.move(aim.x, aim.y);
  await page.mouse.down();
  await page.mouse.move(aim.x + 75, aim.y - 8, { steps: 5 });
  await page.mouse.up();
  await expect(canvas).toHaveAttribute('data-view', 'orbit');
  await page.mouse.wheel(0, -110);
  await settle(page);
  expect((await page.screenshot({ clip: crop })).equals(before)).toBe(false);
  await page.locator('#drive-step').click();
  await expect(canvas).toHaveAttribute('data-view', 'orbit');
  await canvas.press('Home');
  await expect(canvas).toHaveAttribute('data-view', 'chase');
  await canvas.press('ArrowRight');
  await expect(canvas).toHaveAttribute('data-view', 'orbit');
  await page.locator('#reset-view').click();
  await expect(canvas).toHaveAttribute('data-view', 'chase');
  await page.getByRole('button', { name: '自动驾驶' }).click();
  await expect(canvas).toHaveAttribute('data-line-reflection', 'pilot');
  await expect(page.locator('#drive-plan')).toHaveText('向右变道');
  await expect(page.locator('#drive-secondary')).toContainText(/跟踪 [1-5] 个目标/);
  await page.getByRole('button', { name: '密集车流' }).click();
  await expect(page.locator('#drive-plan')).toHaveText('减速跟车');
  await expect(page.locator('#drive-note')).toContainText('近端蓝渐变至远端紫');
  await page.getByRole('button', { name: '混合车流' }).click();
  await expect(page.locator('#telemetry-unit')).toHaveText('360° / 68 m');
  await expect(page.locator('#drive-secondary')).toContainText(/可行轨迹 \d+\/\d+/);
  await page.locator('#drive-pause').click();
  await expect(page.locator('#drive-step')).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.locator('#vehicle')).toHaveAttribute('data-view', 'side');
  await expect(page.locator('#speed')).toHaveValue('205');
  await expect(page.locator('#lab')).toHaveAttribute('data-running', 'true');
  expect(errors).toEqual([]);
});

test('a static studio keeps aerodynamic estimates available without WebGL', async ({ page }) => {
  await page.addInitScript(() => {
    const ctx = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return /webgl/i.test(type) ? null : ctx.call(this, type, ...args);
    };
  });
  await page.goto('/aero-lab.html');
  await expect(page.locator('#stage')).toHaveAttribute('data-renderer', 'fallback');
  await expect
    .poll(() => page.locator('#poster').evaluate((im) => im.naturalWidth))
    .toBeGreaterThan(0);
  await expect(page.locator('#run')).toBeDisabled();
  await expect(page.getByRole('button', { name: '时空隧道' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '自动驾驶' })).toBeDisabled();
  await page.locator('#speed').fill('0');
  await expect(page.locator('#force')).toHaveText('0');
});
