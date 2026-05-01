import { test } from '@playwright/test';
import { expectNoA11yViolations } from './_helpers';

// Admin login is unauthenticated — bypass storageState.
test.use({ storageState: { cookies: [], origins: [] } });

test('admin login page has no WCAG 2.1 AA violations', async ({ page }) => {
  await page.goto('/en/admin/login');
  await page.waitForLoadState('networkidle');
  await expectNoA11yViolations(page, '/en/admin/login');
});
