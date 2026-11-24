import { expect, test } from '@playwright/test';

test('orbital relay renders the globe, animates and focuses stations', async ({ page }, info) => {
  const problems = [];
  page.on('pageerror', (error) => problems.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400) problems.push(response.url());
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/earth-link.html');
  const canvas = page.locator('#relay-earth');
  const center = page.locator('#view-center');
  const motion = page.getByRole('button', { name: '动效', exact: true });
  await expect(page.locator('#earth-surface')).toHaveAttribute(
    'data-renderer',
    /^(webgpu|webgl2)$/,
  );
  expect(Number(await canvas.getAttribute('data-triangles'))).toBeGreaterThan(10000);
  await expect(motion).toHaveAttribute('aria-pressed', 'false');
  const initialCenter = await center.textContent();
  await motion.click();
  await expect(center).not.toHaveText(initialCenter);
  await motion.click();
  await page.getByRole('button', { name: '重置视角' }).click();
  await expect(center).toHaveText(initialCenter);

  await page.getByRole('button', { name: '夜间', exact: true }).click();
  await page.screenshot({ path: info.outputPath('night.png') });
  const night = await canvas.screenshot();
  await page.getByRole('button', { name: '白昼', exact: true }).click();
  await expect.poll(async () => (await canvas.screenshot()).equals(night)).toBe(false);
  await page.screenshot({ path: info.outputPath('day.png') });
  const withLinks = await canvas.screenshot();
  const linkToggle = page.getByRole('button', { name: '链路', exact: true });
  await linkToggle.click();
  await expect(linkToggle).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(async () => (await canvas.screenshot()).equals(withLinks)).toBe(false);
  await linkToggle.click();

  await page.locator('.station-button').filter({ hasText: '悉尼' }).click();
  await expect(page.locator('#site-name')).toHaveText('悉尼');
  await expect(page.locator('#site-rate')).toHaveText('4.81');
  await expect(page.locator('#site-links li')).toHaveCount(2);
  await expect(center).toContainText('151.2°E');
  await page.getByRole('button', { name: '在地图上选择洛杉矶' }).click();
  await expect(page.locator('#map-station')).toContainText('LAX');
  await expect(page.locator('#site-code')).toHaveText('LAX');
  await expect(center).toContainText('118.2°W');
  const stationCenter = await center.textContent();
  await canvas.press('ArrowLeft');
  await expect(center).not.toHaveText(stationCenter);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expect(canvas).toBeInViewport();
  await page.screenshot({ path: info.outputPath('mobile.png') });
  expect(problems).toEqual([]);
});

test('orbital relay keeps station data and its static globe available without a GPU', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'gpu', { configurable: true, value: undefined });
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      return /webgl/i.test(kind) ? null : getContext.call(this, kind, ...args);
    };
  });
  await page.goto('/earth-link.html');
  await expect(page.locator('#earth-surface')).toHaveAttribute('data-renderer', 'fallback');
  await expect(page.locator('#earth-fallback')).toBeVisible();
  await expect
    .poll(() => page.locator('#earth-fallback').evaluate((el) => el.naturalWidth))
    .toBeGreaterThan(0);
  await expect(page.getByRole('button', { name: '夜间', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '在地图上选择法兰克福' }).click();
  await expect(page.locator('#site-rate')).toHaveText('7.34');
  await expect(page.locator('#site-links')).toContainText('DXB');
});

test('the luminous signal moves along the links with the camera locked', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install();
  await page.goto('/earth-link.html');
  const canvas = page.locator('#relay-earth');
  const motion = page.getByRole('button', { name: '动效', exact: true });
  const routes = page.getByRole('button', { name: '链路', exact: true });
  await expect(routes).toBeEnabled();
  const center = page.locator('#view-center');
  const initial = await center.textContent();
  await canvas.press('ArrowLeft');
  await expect(center).not.toHaveText(initial);
  const locked = await center.textContent();
  const capture = async () => {
    const on = await canvas.screenshot();
    await routes.click();
    await expect.poll(async () => (await canvas.screenshot()).equals(on)).toBe(false);
    const off = await canvas.screenshot();
    await routes.click();
    return [on, off].map((png) => png.toString('base64'));
  };
  const before = await capture();
  await motion.click();
  await page.clock.runFor(600);
  await motion.click();
  const after = await capture();
  await expect(center).toHaveText(locked);
  const changed = await page.evaluate(
    async (screenshots) => {
      const rgba = await Promise.all(
        screenshots.map(async (encoded) => {
          const blob = await (await fetch('data:image/png;base64,' + encoded)).blob();
          const image = await createImageBitmap(blob);
          const context = new OffscreenCanvas(image.width, image.height).getContext('2d');
          context.drawImage(image, 0, 0);
          image.close();
          return context.getImageData(0, 0, context.canvas.width, context.canvas.height).data;
        }),
      );
      // Subtract the planet at each instant, including its moving clouds and station pulse.
      const [on1, off1, on2, off2] = rgba;
      let pixels = 0;
      for (let i = 0; i < on1.length; i += 4) {
        if (
          [0, 1, 2].some(
            (c) => Math.abs(on2[i + c] - off2[i + c] - (on1[i + c] - off1[i + c])) > 32,
          )
        )
          pixels++;
      }
      return pixels;
    },
    [...before, ...after],
  );
  expect(changed).toBeGreaterThan(30);
});
