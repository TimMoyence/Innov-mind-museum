import { test } from '@playwright/test';
import { expectNoA11yViolations } from './_helpers';

test('admin dashboard has no WCAG 2.1 AA violations', async ({ page }) => {
  await page.goto('/en/admin');
  await page.waitForLoadState('networkidle');
  await expectNoA11yViolations(page, '/en/admin');
});
