import { test } from '@playwright/test';
import { expectNoA11yViolations } from './_helpers';

// Public page — bypass storageState (avoid logged-in user landing on the public site).
test.use({ storageState: { cookies: [], origins: [] } });

// R4 AC6 + R16 — zero WCAG 2.1 AA violations on /fr/b2b AND /en/b2b.
// Mirror of public-support.a11y.spec.ts ; dual-locale required by AC6.

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
