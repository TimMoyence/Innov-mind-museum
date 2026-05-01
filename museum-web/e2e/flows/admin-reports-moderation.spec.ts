import { test, expect } from '@playwright/test';

test('admin can view the reports moderation page', async ({ page }) => {
  await page.goto('/en/admin/reports');
  await expect(page.getByRole('heading', { name: /reports|signalements/i })).toBeVisible();
});

test('admin moderation page renders empty-state or report list', async ({ page }) => {
  await page.goto('/en/admin/reports');
  await page.waitForLoadState('networkidle');

  // Either the page shows an empty-state message OR at least one report row.
  // Both outcomes are valid (fresh test DB has no reports). The spec asserts
  // the page renders without runtime errors and exposes some content area.
  // Reports page renders "No reports" (adminDict.reportsPage.noReports) in a
  // table cell when the list is empty; check for that or a data row.
  const hasEmpty = (await page.getByText(/no reports|aucun signalement|empty/i).count()) > 0;
  const hasRows = (await page.getByRole('row').count()) > 1;
  expect(hasEmpty || hasRows).toBe(true);
});
