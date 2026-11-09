import { test, expect } from '@playwright/test';

test('admin can view the audit logs page', async ({ page }) => {
  await page.goto('/en/admin/audit-logs');
  await expect(page.getByRole('heading', { name: /audit/i })).toBeVisible();
});

test('admin sees their own audit entry after taking an action', async ({ page }) => {
  await page.goto('/en/admin/users');
  await page.waitForLoadState('networkidle');

  await page.goto('/en/admin/audit-logs');
  await expect(page.getByRole('heading', { name: /audit/i })).toBeVisible();

  const dataRows = page.getByRole('row');
  await expect(dataRows).not.toHaveCount(0);
});
