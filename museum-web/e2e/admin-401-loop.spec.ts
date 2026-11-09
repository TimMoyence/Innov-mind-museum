import { test, expect } from '@playwright/test';

test('admin 401 does not loop between /admin/users and /admin/login', async ({ page }) => {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"expired"}' }),
  );
  await page.route('**/api/auth/refresh', (route) =>
    route.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"expired"}' }),
  );
  await page.route('**/api/admin/**', (route) =>
    route.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"expired"}' }),
  );

  await page.goto('/en/admin/users');

  await page.waitForURL(/\/en\/admin\/login(\?|$)/, { timeout: 15_000 });
  const firstUrl = new URL(page.url()).pathname;

  await expect(page.getByRole('heading', { name: /musaium/i })).toBeVisible({ timeout: 10_000 });

  await page.waitForTimeout(1500);
  const secondUrl = new URL(page.url()).pathname;
  expect(secondUrl).toBe(firstUrl);
  expect(secondUrl).toMatch(/\/en\/admin\/login$/);
});
