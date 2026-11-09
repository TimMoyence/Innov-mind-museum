import { test, expect } from '@playwright/test';

import { getAdminCreds } from '../fixtures/auth';

test('admin opens a user detail page from the list', async ({ page }) => {
  const { email } = getAdminCreds();

  await page.goto('/en/admin/users');

  await expect(page.getByRole('cell', { name: email })).toBeVisible({ timeout: 10_000 });

  const adminRow = page.getByRole('row').filter({ hasText: email });
  await Promise.all([
    page.waitForURL(/\/admin\/users\/\d+$/, { timeout: 30_000 }),
    adminRow.getByRole('link', { name: /view user details/i }).click(),
  ]);

  await expect(page.getByRole('heading', { level: 2, name: /identity/i })).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByRole('heading', { level: 2, name: /status/i })).toBeVisible();

  await expect(page.getByRole('definition').filter({ hasText: email })).toBeVisible();
});

test('admin opens the change-role modal from detail page', async ({ page }) => {
  const { email } = getAdminCreds();

  await page.goto('/en/admin/users');
  await expect(page.getByRole('cell', { name: email })).toBeVisible({ timeout: 10_000 });

  await Promise.all([
    page.waitForURL(/\/admin\/users\/\d+$/, { timeout: 30_000 }),
    page
      .getByRole('link', { name: /view user details/i })
      .first()
      .click(),
  ]);

  const changeRoleBtn = page.getByRole('button', { name: /change role/i });
  await expect(changeRoleBtn).toBeVisible({ timeout: 10_000 });
  await changeRoleBtn.click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel(/new role/i)).toBeVisible();
  await expect(dialog.getByRole('button', { name: /confirm/i })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
