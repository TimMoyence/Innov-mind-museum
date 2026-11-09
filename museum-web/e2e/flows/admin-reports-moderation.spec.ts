import { test, expect } from '@playwright/test';

test('admin can view the reports moderation page', async ({ page }) => {
  await page.goto('/en/admin/reports');
  await expect(page.getByRole('heading', { name: /reports|signalements/i })).toBeVisible();
});

test('admin moderation page renders empty-state or report list', async ({ page }) => {
  await page.goto('/en/admin/reports');

  await expect(
    page
      .getByText(/no reports|aucun signalement|empty/i)
      .or(page.getByRole('row').nth(1))
      .first(),
  ).toBeVisible({ timeout: 30_000 });
});
