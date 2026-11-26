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
