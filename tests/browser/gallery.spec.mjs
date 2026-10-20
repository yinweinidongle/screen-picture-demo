import { test, expect } from '@playwright/test';
const errors = new WeakMap();
test.beforeEach(async ({ page }) => {
  const list = [];
  errors.set(page, list);
  page.on('pageerror', (e) => list.push(e.message));
});
test.afterEach(async ({ page }, info) => {
  expect(errors.get(page)).toEqual([]);
  if (!page.isClosed())
    await page.screenshot({ path: info.outputPath('review.png'), fullPage: true });
});
test('Home: registry cards, filters, one live scene and mobile layout', async ({ page }) => {
  await page.goto('/home.html');
  await expect(page.locator('.screen-card')).toHaveCount(4);
  await expect(page.locator('.hero')).toHaveCount(0);
  await page.locator('[data-filter="geo"]').click();
  await expect(page.locator('.screen-card:visible')).toHaveCount(2);
  await page.locator('[data-filter="all"]').click();
  await page.locator('[data-page="wind.html"] .live-toggle').click();
  await expect(page.locator('iframe')).toHaveCount(1);
  await expect(page.locator('.screen-card.loading')).toHaveCount(0);
  await page.locator('[data-page="factory.html"] .live-toggle').click();
  await expect(page.locator('iframe')).toHaveCount(1);
  await expect(page.locator('iframe')).toHaveAttribute('src', 'factory.html');
  await page.locator('[data-filter="geo"]').click();
  await expect(page.locator('iframe')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
test('wind: render, reduced draw calls, stop, explode, wire and flow', async ({ page }) => {
  await page.goto('/wind.html');
  const canvas = page.locator('#wind-3d-canvas');
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  expect(Number(await canvas.getAttribute('data-draw-calls'))).toBeLessThan(300);
  await page.locator('#wind-running').click();
  await expect(canvas).toHaveAttribute('data-running', 'false');
  await page.locator('#wind-explode').click();
  await expect(canvas).toHaveAttribute('data-exploded', 'true');
  await page.locator('#wind-wire').click();
  await expect(canvas).toHaveAttribute('data-wire', 'true');
  await page.locator('#wind-wire').click();
  await page.locator('#wind-flow').click();
  await expect(canvas).toHaveAttribute('data-flow', 'true');
  await page.locator('#unit-select').selectOption('G1030');
  await expect(page.locator('#unit-name')).toHaveText('G1030');
});
test('factory: WebGL and day/night sweep', async ({ page }) => {
  await page.goto('/factory.html');
  const canvas = page.locator('#factory-3d-canvas');
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  await page.locator('#factory-theme-toggle').click();
  await expect(canvas).toHaveAttribute('data-theme-progress', '1.000');
});
test('population: globe renders and keyboard changes view', async ({ page }) => {
  await page.goto('/population.html');
  const canvas = page.locator('#earth-canvas');
  await expect(page.locator('#earth-stage')).toHaveAttribute('data-renderer', 'webgl');
  await expect(canvas).toBeVisible();
  await canvas.focus();
  await canvas.press('ArrowLeft');
  await expect(page.locator('#population-screen')).toBeVisible();
});
test('inspection: province hover exposes tooltip without a dialog', async ({ page }) => {
  await page.goto('/inspection.html');
  const province = page.getByRole('button', { name: '查看四川省巡检数据' });
  await province.hover();
  await expect(page.locator('#tooltip')).toBeVisible();
  await expect(page.locator('#modal-backdrop')).not.toHaveClass(/open/);
});
