import { test, expect } from '@playwright/test';
import { snapshot } from '../../src/screens/civic-pulse/data.js';

test.use({ reducedMotion: 'reduce' });
test('district, canopy, work orders and hourly chart share a municipal snapshot', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/civic-pulse.html');
  const tree = page.locator('#canopy');
  await expect(tree).toHaveAttribute('data-renderer', 'webgl2');
  await expect(tree).toHaveAttribute('data-playing', 'false');
  const district = page.getByRole('button', { name: /仓山区.*件/ });
  await district.click();
  await expect(page.locator('#tickets')).toHaveText(snapshot(2).total.toLocaleString('zh-CN'));
  await page.locator('#pins button[data-service="2"]').click();
  await expect(tree).toHaveAttribute('data-service', 'lights');
  await expect(page.locator('#tickets')).toHaveText(String(snapshot(2, 2).total));
  await expect(page.locator('#services button[aria-pressed=true]')).toContainText('公共照明');
  await page.getByRole('button', { name: '12时', exact: true }).click();
  await expect(page.locator('#trend')).toContainText('05:00');
  await page.locator('.trend-box').focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#trend-tip')).toContainText('15:00');
  await tree.focus();
  await page.keyboard.press('ArrowRight');
  await expect(tree).not.toHaveAttribute('data-yaw', '0.000');
  await page.getByRole('button', { name: '复位视角' }).click();
  await expect(tree).toHaveAttribute('data-yaw', '0.000');
  await page.getByRole('button', { name: '播放信号' }).click();
  await expect(tree).toHaveAttribute('data-playing', 'true');
  await page.getByRole('button', { name: '暂停信号' }).click();
  await page.getByRole('button', { name: /查看工单/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: /仓山区/ })).toHaveCount(3);
  await dialog.locator('[data-event]').first().click();
  await expect(dialog).toContainText('照明运维组');
  await expect(dialog).toContainText('处置记录');
  await dialog.getByRole('button', { name: '返回工单列表' }).click();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('#all-events')).toBeFocused();
  await page.getByRole('button', { name: '全部领域' }).click();
  await expect(tree).toHaveAttribute('data-service', 'all');
  expect(errors).toEqual([]);
});

test('mobile projected canopy and work orders also work without WebGL', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return type === 'webgl2' ? null : original.call(this, type, ...args);
    };
  });
  await page.goto('/civic-pulse.html');
  const tree = page.locator('#canopy');
  await expect(tree).toHaveAttribute('data-renderer', 'canvas2d');
  const painted = () =>
    page.locator('.flat').evaluate((c) =>
      c
        .getContext('2d')
        .getImageData(0, 0, c.width, c.height)
        .data.some((v, i) => i % 4 === 3 && v > 40),
    );
  await expect.poll(painted).toBe(true);
  await page.locator('#pins button[data-service="0"]').click();
  await expect(tree).toHaveAttribute('data-service', 'water');
  await page.locator('#feed button').first().click();
  await expect(page.getByRole('dialog')).toContainText('排水设施养护组');
  await page.keyboard.press('Escape');
  await expect(page.locator('#feed button').first()).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});
