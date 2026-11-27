import { expect, test } from '@playwright/test';

test.use({ reducedMotion: 'reduce' });

test('chili monitor loads the textured plant and keeps irrigation controls scoped to a plot', async ({
  page,
}) => {
  await page.goto('/chili-monitor.html');
  await expect(page.getByText('模拟数据 · 监控示意', { exact: true })).toBeVisible();

  const plant = page.getByRole('group', { name: /三维辣椒植株/ });
  await expect(plant).toHaveAttribute('data-renderer', 'webgl');
  await expect(plant).toHaveAttribute('data-leaf-texture', 'ready');
  await plant.press('ArrowRight');
  await expect(plant).not.toHaveAttribute('data-yaw', '0.000');
  await plant.press('Home');
  await expect(plant).toHaveAttribute('data-yaw', '0.000');

  const company = page.getByRole('combobox', { name: '企业名称' });
  const plot = page.getByRole('combobox', { name: '地块' });
  const tank = page.getByRole('switch', { name: 'A桶' });
  const soilTemperature = page.locator('[data-chili-reading="soilTemperature"]');

  await expect(tank).toHaveAttribute('aria-checked', 'false');
  await tank.click();
  await expect(tank).toHaveAttribute('aria-checked', 'true');

  await company.selectOption({ label: '故城辣椒种植合作社' });
  await expect(plot.locator('option:checked')).toHaveText('故城一号地块');
  await expect(tank).toHaveAttribute('aria-checked', 'false');
  await plot.selectOption({ label: '故城二号地块' });
  await expect(soilTemperature).toHaveText('25.4');

  await company.selectOption({ label: '衡水辣椒种植基地' });
  await expect(tank).toHaveAttribute('aria-checked', 'true');
  await expect(soilTemperature).toHaveText('26.8');
});
