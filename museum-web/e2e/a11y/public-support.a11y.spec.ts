import { test } from '@playwright/test';
import { expectNoA11yViolations } from './_helpers';

test.use({ storageState: { cookies: [], origins: [] } });

test('public support page has no WCAG 2.1 AA violations', async ({ page }) => {
  await page.goto('/en/support');
  await page.waitForLoadState('networkidle');
  await expectNoA11yViolations(page, '/en/support');
});
