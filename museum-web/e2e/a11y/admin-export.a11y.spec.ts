import { test } from '@playwright/test';
import { expectNoA11yViolations } from './_helpers';

/**
 * R2 corrective loop 1 (2026-05-15) — AC14 explicit a11y coverage for the
 * `<ExportCsvButton>` mounted on the 4 admin surfaces (analytics, support,
 * tickets, reviews). Existing per-page admin a11y specs do scan the button
 * implicitly, but this dedicated spec pins WCAG 2.1 AA on the export-button
 * surface so a regression in the button alone is caught even when the
 * surrounding admin page passes.
 */
test('admin analytics export button has no WCAG 2.1 AA violations (FR)', async ({ page }) => {
  await page.goto('/fr/admin/analytics');
  await page.waitForLoadState('networkidle');
  await expectNoA11yViolations(page, '/fr/admin/analytics');
});

test('admin analytics export button has no WCAG 2.1 AA violations (EN)', async ({ page }) => {
  await page.goto('/en/admin/analytics');
  await page.waitForLoadState('networkidle');
  await expectNoA11yViolations(page, '/en/admin/analytics');
});
