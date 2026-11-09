import { test } from '@playwright/test';
import { expectNoA11yViolations } from './_helpers';

test.use({ storageState: { cookies: [], origins: [] } });

test('public beta-signup section (en) has no WCAG 2.1 AA violations', async ({ page }) => {
  await page.goto('/en#beta-signup');
  await page.waitForLoadState('networkidle');
  await expectNoA11yViolations(page, '/en#beta-signup');
});

test('public beta-signup section (fr) has no WCAG 2.1 AA violations', async ({ page }) => {
  await page.goto('/fr#beta-signup');
  await page.waitForLoadState('networkidle');
  await expectNoA11yViolations(page, '/fr#beta-signup');
});
