import { test } from '@playwright/test';
import { expectNoA11yViolations } from './_helpers';

// Public page — bypass storageState (avoid logged-in user landing on the public site).
test.use({ storageState: { cookies: [], origins: [] } });

// R3 AC6 + R19 — zero WCAG 2.1 AA violations on /fr AND /en where
// <BetaSignupSection> is rendered at the #beta-signup anchor on the landing.
// Mirror of public-b2b.a11y.spec.ts ; dual-locale required by AC6.

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
