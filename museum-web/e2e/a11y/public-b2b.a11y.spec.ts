import { test } from '@playwright/test';
import { expectNoA11yViolations } from './_helpers';

test.use({ storageState: { cookies: [], origins: [] } });

test('public b2b page (en) has no WCAG 2.1 AA violations', async ({ page }) => {
  await page.goto('/en/b2b');
  await page.waitForLoadState('networkidle');
  await expectNoA11yViolations(page, '/en/b2b');
});

test('public b2b page (fr) has no WCAG 2.1 AA violations', async ({ page }) => {
  await page.goto('/fr/b2b');
  await page.waitForLoadState('networkidle');
  await expectNoA11yViolations(page, '/fr/b2b');
});
