import { expect, test } from '@playwright/test';
import { getPlotReading } from '../../src/screens/verdant-lab/instruments.js';

test.use({ reducedMotion: 'reduce' });

test('greenhouse controls, plant imaging and instruments share a crop record', async ({ page }) => {
  const faults = [];
  page.on('pageerror', (error) => faults.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && /shader|webglprogram/i.test(message.text()))
      faults.push(message.text());
  });
  await page.goto('/verdant-lab.html');
  const plant = page.locator('#specimen-host');
  await expect(plant).toHaveAttribute('data-renderer', 'webgl2');
  await expect(plant).toHaveAttribute('data-texture', 'ready');
  await expect(plant).toHaveAttribute('data-scan-texture', 'ready');
  const bezel = page.locator('[data-circuit="irrigation"]');
  const frozen = () => bezel.evaluate((s) => s.animationsPaused());
  await expect.poll(frozen).toBe(true);
  await page.getByRole('button', { name: '播放动效' }).click();
  await expect.poll(frozen).toBe(false);
  await page.getByRole('button', { name: '暂停动效' }).click();
  await expect.poll(frozen).toBe(true);

  const plot = page.getByLabel('观测温室');
  await plot.selectOption({ label: '湖东二号棚' });
  await page.getByRole('button', { name: '膨果期', exact: true }).click();
  const record = getPlotReading(1, 1);
  await expect(page.locator('#cultivar')).toHaveText(record.variety);
  await expect(page.locator('#day')).toHaveText(String(record.day));
  await expect(page.locator('[data-sensor="temperature"]')).toHaveText(
    record.temperature.toFixed(1),
  );
  await expect(page.getByRole('button', { name: '番茄果序', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const optical = page.getByRole('button', { name: '自然光', exact: true });
  await optical.click();
  await expect(optical).toHaveAttribute('aria-pressed', 'true');
  await expect(plant).toHaveAttribute('data-mode', 'natural');
  await plant.press('Enter');
  await expect(page.locator('#fruit-detail')).toContainText(record.variety + ' · 膨果期');
  const initialYaw = await plant.getAttribute('data-yaw');
  await plant.press('ArrowRight');
  await expect(plant).not.toHaveAttribute('data-yaw', initialYaw);
  await page.getByRole('button', { name: '复位视角' }).click();
  await expect(plant).toHaveAttribute('data-yaw', initialYaw);
  await expect(page.locator('#fruit-detail')).toBeHidden();

  const main = page.getByRole('switch', { name: '滴灌主阀' });
  const pump = page.getByRole('switch', { name: '营养液 A 泵' });
  await main.click();
  await expect(main).not.toBeChecked();
  await expect(pump).toBeDisabled();
  await expect(page.locator('[data-flow]')).toHaveText('0.0');
  await plot.selectOption({ label: '北区一号棚' });
  await expect(main).toBeChecked();
  await plot.selectOption({ label: '湖东二号棚' });
  await expect(main).not.toBeChecked();
  await main.click();
  await expect(pump).toBeEnabled();

  const received = page.locator('[data-in]');
  const sevenDayTotal = Number(await received.textContent());
  await page.getByRole('button', { name: '30 天', exact: true }).click();
  expect(Number(await received.textContent())).toBeGreaterThan(sevenDayTotal);
  const chart = page.getByRole('group', { name: /入库出库量/ });
  await chart.focus();
  const value = await chart.locator('output').innerText();
  await chart.press('ArrowLeft');
  await expect(chart.locator('output')).not.toHaveText(value);
  expect(faults).toEqual([]);
});

test('mobile greenhouse projects the specimen and supports camera selection without WebGL', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return /webgl/i.test(type) ? null : original.call(this, type, ...args);
    };
  });
  await page.goto('/verdant-lab.html');
  const plant = page.locator('#specimen-host');
  await expect(plant).toHaveAttribute('data-renderer', 'canvas2d');
  const canvas = plant.locator('canvas:visible');
  await expect
    .poll(() =>
      canvas.evaluate((c) => {
        const ctx = c.getContext('2d');
        return Boolean(
          c.width &&
          c.height &&
          ctx.getImageData(0, 0, c.width, c.height).data.some((v, i) => i % 4 === 3 && v > 100),
        );
      }),
    )
    .toBe(true);
  await page.getByRole('button', { name: '开花期', exact: true }).click();
  await expect(page.locator('#stage-note')).toContainText('花');
  await page.getByRole('button', { name: '育苗苗床', exact: true }).click();
  const snapshot = page.getByRole('img', { name: '育苗苗床巡检示意快照' });
  await expect(snapshot).toBeVisible();
  await expect.poll(() => snapshot.evaluate((im) => im.complete && im.naturalWidth > 0)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('paused WebGL plant remains painted on mobile load, resize and full-page capture', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const host = page.locator('#specimen-host'),
    mobile = { width: 390, height: 844 };
  async function assertPainted() {
    await expect(host).toHaveAttribute('data-playing', 'false');
    await expect(host).toHaveAttribute('data-renderer', 'webgl2');
    await expect(host).toHaveAttribute('data-scan-texture', 'ready');
    // A few surviving ring or cursor pixels cannot satisfy all three plant regions.
    const bands = () =>
      host.locator('canvas:visible').evaluate((c) => {
        const gl = c.getContext('webgl2'),
          pixels = new Uint8Array(c.width * c.height * 4);
        gl.readPixels(0, 0, c.width, c.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        const counts = [0, 0, 0];
        for (let y = 0; y < c.height; y += 2) {
          for (let x = 0; x < c.width; x += 2) {
            const k = 4 * (y * c.width + x);
            if (pixels[k + 1] > 72 && pixels[k + 3] > 150) counts[Math.floor((y * 3) / c.height)]++;
          }
        }
        return Math.min(...counts);
      });
    await expect.poll(bands).toBeGreaterThan(100);
    const box = await host.boundingBox();
    const png = (await page.screenshot({ fullPage: true, scale: 'css' })).toString('base64');
    const minimum = await page.evaluate(
      async ({ png, box }) => {
        const image = new Image();
        image.src = 'data:image/png;base64,' + png;
        await image.decode();
        const c = document.createElement('canvas');
        c.width = Math.floor(box.width * 0.48);
        c.height = Math.floor(box.height * 0.76);
        const ctx = c.getContext('2d');
        ctx.drawImage(
          image,
          box.x + box.width * 0.26,
          box.y + box.height * 0.13,
          c.width,
          c.height,
          0,
          0,
          c.width,
          c.height,
        );
        const d = ctx.getImageData(0, 0, c.width, c.height).data,
          counts = [0, 0, 0];
        for (let k = 0; k < d.length; k += 4) {
          if (d[k + 2] - d[k] > 30 && d[k + 1] > 85 && d[k + 2] > 115)
            counts[Math.floor(((k / 4 / c.width) * 3) / c.height)]++;
        }
        return Math.min(...counts);
      },
      { box, png },
    );
    expect(minimum).toBeGreaterThan(120);
    expect(await bands()).toBeGreaterThan(100);
  }
  await page.setViewportSize(mobile);
  await page.goto('/verdant-lab.html');
  await assertPainted();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.getByRole('button', { name: '自然光', exact: true }).click();
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole('button', { name: '叶脉显影', exact: true }).click();
  await page.setViewportSize(mobile);
  await assertPainted();
});
