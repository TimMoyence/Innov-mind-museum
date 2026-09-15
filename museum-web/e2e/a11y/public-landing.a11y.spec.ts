import { test, expect } from '@playwright/test';
import { expectNoA11yViolations } from './_helpers';

// Public page — bypass storageState (avoid logged-in user landing on the public site).
test.use({ storageState: { cookies: [], origins: [] } });

test('public landing page has no WCAG 2.1 AA violations', async ({ page }) => {
  await page.goto('/en');
  await expect(page.locator('main#main')).toBeVisible();
  await expectNoA11yViolations(page, '/en');
});
