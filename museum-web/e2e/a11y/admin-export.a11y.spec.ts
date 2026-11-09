import { test } from '@playwright/test';
import { expectNoA11yViolations } from './_helpers';

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
