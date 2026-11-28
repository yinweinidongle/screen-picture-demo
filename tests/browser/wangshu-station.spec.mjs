import { expect, test } from '@playwright/test';

test('station fills the viewport and its camera, train and instruments share the arrival clock', async ({
  page,
}) => {
  test.setTimeout(100000);
  await page.setViewportSize({ width: 960, height: 600 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/wangshu-station.html?t=7.45');
  await expect(page.locator('#station')).toHaveAttribute('data-renderer', 'webgl', {
    timeout: 75000,
  });
  expect(await page.locator('#scene canvas').boundingBox()).toEqual({
    x: 0,
    y: 0,
    width: 960,
    height: 600,
  });
  await expect(page.locator('#speed')).toHaveText('28.1');
  await expect(page.locator('#remaining')).toHaveText('30.2');

  await expect(page.locator('footer, .transport')).toHaveCount(0);
  expect(
    await page.locator('.mast-art img').evaluate((img) => img.complete && img.naturalWidth > 0),
  ).toBe(true);
  await expect(page.locator('#deceleration')).toHaveText('1.07');
  await expect(page.locator('#brake-bars rect')).toHaveCount(26);
  await page.locator('#camera-menu summary').click();
  await page.getByRole('button', { name: '切换至绕车头升起' }).click();
  await expect(page.locator('#elapsed')).toHaveText('00:14.5');
  await expect(page.locator('#scan')).toHaveText('74%');
  await page.locator('#camera-menu summary').click();
  await page.getByRole('button', { name: '自由观察' }).click();
  await expect(page.locator('#orbit')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(page.locator('#orbit')).toHaveAttribute('aria-pressed', 'false');
  const slider = page.getByRole('slider', { name: '在速度曲线上回看进站' });
  await slider.fill('18');
  await expect(page.locator('#speed')).toHaveText('0.0');
  await expect(page.locator('#travelled')).toHaveText('112.0');
  await expect(page.locator('#motion')).toHaveText('已停稳');
  await expect(page.locator('#scan')).toHaveText('100%');
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await expect(page.locator('#elapsed')).not.toHaveText('00:18.0');
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  expect(errors).toEqual([]);
});

test('offline mobile view keeps its poster, controls and readings if WebGL is unavailable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return type === 'webgl2' ? null : original.call(this, type, ...args);
    };
  });
  await page.goto('/standalone/wangshu-station.html');
  await expect(page.locator('#station')).toHaveAttribute('data-renderer', 'fallback');
  await expect(page.locator('#render-status')).toContainText('静态场景');
  await expect(page.getByRole('button', { name: '播放', exact: true })).toBeVisible();
  expect(
    await page.locator('.poster').evaluate((image) => image.complete && image.naturalWidth > 0),
  ).toBe(true);
  await expect(page.locator('#instruments')).toBeHidden();
  await page.getByRole('button', { name: '展开仪表' }).click();
  await expect(page.locator('#instruments')).toBeVisible();
  await page.getByRole('slider').fill('19');
  await expect(page.locator('#remaining')).toHaveText('0.0');
  await page.locator('#camera-menu summary').click();
  await page.getByRole('button', { name: '切换至穹顶俯移' }).click();
  await expect(page.locator('#speed')).toHaveText('46.1');
  await expect(page.locator('#remaining')).toHaveText('112.0');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});
