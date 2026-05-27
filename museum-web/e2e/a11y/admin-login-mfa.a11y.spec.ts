import { test, expect } from '@playwright/test';
import { expectNoA11yViolations } from './_helpers';

// screen: AdminLoginMfaChallenge
//
// T3.1 RED (UFR-021 + a11y NFR + R15). Materialised BEFORE the LoginForm
// challenge-step impl (Phase 5). Mirrors `admin-login.a11y.spec.ts`:
// storageState bypass (admin login is unauthenticated) + the shared
// `expectNoA11yViolations` axe helper.
//
// Flow: stub `/api/auth/login` to return a 200 MfaRequiredResponse, submit
// credentials, wait for the challenge code input to appear, then run axe and
// assert focus + an aria-live region exist.
//
// RED today: the challenge code input never appears (no challenge step in
// LoginForm) → the `waitFor` selector times out. Phase 5 turns this GREEN.
//
// NOTE: Playwright execution is OPTIONAL in the red-phase env (browsers may be
// unavailable). The spec is structured to run under `npm run test:a11y` / CI.

test.use({ storageState: { cookies: [], origins: [] } });

test('admin login MFA challenge step has no WCAG 2.1 AA violations', async ({ page }) => {
  // Return a MfaRequiredResponse (200) so submitting credentials transitions
  // the login UI into the TOTP challenge step rather than establishing a session.
  await page.route('**/api/auth/login', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        mfaRequired: true,
        mfaSessionToken: 'e2e-mfa-session-token',
        mfaSessionExpiresIn: 300,
      }),
    });
  });

  await page.goto('/en/admin/login');
  await page.waitForLoadState('networkidle');

  await page.getByPlaceholder('Email').fill('admin@test.com');
  await page.getByPlaceholder('Password').fill('secret123');
  await page.getByRole('button', { name: 'Sign in' }).click();

  // The challenge code input (labelled by the mfaCodeLabel dict key) must appear.
  const codeInput = page.getByLabel('Authentication code');
  await codeInput.waitFor({ state: 'visible' });

  // R15 — focus is moved to the code input on step entry.
  await expect(codeInput).toBeFocused();

  // The challenge step must expose exactly one error live region for a11y
  // announcements (NFR a11y). Scoped by data-testid so we assert THIS component's
  // region, not Next.js's framework route-announcer (#__next-route-announcer__),
  // which also carries aria-live on every App Router page.
  const liveRegion = page.getByTestId('mfa-live-region');
  await expect(liveRegion).toHaveCount(1);
  await expect(liveRegion).toHaveAttribute('aria-live', 'assertive');

  await expectNoA11yViolations(page, '/en/admin/login#mfa-challenge');
});
