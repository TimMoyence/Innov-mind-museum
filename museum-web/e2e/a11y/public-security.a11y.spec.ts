import { test } from '@playwright/test';
import { expectNoA11yViolations } from './_helpers';

// Public page — bypass storageState (avoid logged-in user landing on the public site).
test.use({ storageState: { cookies: [], origins: [] } });

test('public security page has no WCAG 2.1 AA violations', async ({ page }) => {
  await page.goto('/en/security');
  await page.waitForLoadState('networkidle');
  await expectNoA11yViolations(page, '/en/security');
});
