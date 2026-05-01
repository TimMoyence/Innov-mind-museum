import { test, expect } from '@playwright/test';
import { getAdminCreds } from '../fixtures/auth';

// Override storageState — this spec exercises the login UI fresh.
test.use({ storageState: { cookies: [], origins: [] } });

test('admin login flow', async ({ page }) => {
  const { email, password } = getAdminCreds();

  await page.goto('/en/admin/login');
  await expect(page.getByRole('heading', { name: /musaium/i })).toBeVisible();

  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /log in|sign in|connecter/i }).click();

  await page.waitForURL(/\/en\/admin(\/|$)/, { timeout: 15_000 });
  await expect(page).toHaveURL(/\/en\/admin(\/|$)/);
});

test('admin login rejects wrong password', async ({ page }) => {
  const { email } = getAdminCreds();
  await page.goto('/en/admin/login');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill('definitely-not-the-password');
  await page.getByRole('button', { name: /log in|sign in|connecter/i }).click();

  // The form keeps the user on /admin/login and surfaces the error message.
  await expect(page).toHaveURL(/\/admin\/login/);
  await expect(page.locator('[role="alert"], .text-red-700, .error').first()).toBeVisible({
    timeout: 5_000,
  });
});
