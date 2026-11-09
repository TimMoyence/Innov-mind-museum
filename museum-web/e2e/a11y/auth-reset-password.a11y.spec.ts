import { test } from '@playwright/test';
import { expectNoA11yViolations } from './_helpers';

test.use({ storageState: { cookies: [], origins: [] } });

test('reset-password page (no token → error state) has no WCAG 2.1 AA violations', async ({
  page,
}) => {
  await page.goto('/en/reset-password');
  await page.waitForLoadState('networkidle');
  await expectNoA11yViolations(page, '/en/reset-password');
});
