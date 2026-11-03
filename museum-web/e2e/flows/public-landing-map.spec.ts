import { expect, test } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

test('landing demo map renders a maplibre canvas wherever WebGL exists', async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));

  await page.goto('/fr');
  await page.getByText('20 musées à proximité').scrollIntoViewIfNeeded();

  const webglAvailable = await page.evaluate(
    () => document.createElement('canvas').getContext('webgl2') !== null,
  );
  const canvas = page.locator('canvas.maplibregl-canvas');

  if (webglAvailable) {
    await expect(canvas).toBeVisible();
    await expect(page.locator('.maplibregl-marker')).toHaveCount(20);
  } else {
    await expect(canvas).toHaveCount(0);
  }
  await expect(page.getByText('20 musées à proximité')).toBeVisible();
  expect(pageErrors).toEqual([]);
});
