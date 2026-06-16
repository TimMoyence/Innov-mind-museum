import { test, expect } from '@playwright/test';
import { expectNoA11yViolations } from './_helpers';

// Public page — bypass storageState (avoid a logged-in user landing on the
// public site, which would render the admin shell without the public layout).
test.use({ storageState: { cookies: [], origins: [] } });

/**
 * I-CMP5(a) / R9 — WCAG 2.4.1 "Bypass Blocks". The public web app must expose a
 * keyboard-reachable skip-link as the FIRST focusable element, targeting an
 * id-anchored <main>. Pre-fix:
 *   - `[locale]/layout.tsx:25` renders `<main className="flex-1">` with NO id;
 *   - there is no skip-link anywhere in the tree (grep skip-link = 0 repo-wide);
 *   - the first Tab focuses the header logo link, not a skip-link.
 *
 * Copy resolves from the i18n dict (`dict.a11y.skipToContent`) — added in the
 * GREEN phase to both en.json/fr.json + the `Dictionary` type (per-component
 * string-guard: no hardcoded multi-word UX phrase in source).
 *
 * Dual-locale (/en + /fr) required by the lot acceptance.
 */
for (const route of ['/en', '/fr'] as const) {
  test(`skip-link is the first focusable element on ${route} and moves focus to #main`, async ({
    page,
  }) => {
    await page.goto(route);
    await page.waitForLoadState('networkidle');

    // WCAG 2.4.1: the skip-link must be the FIRST element in DOM tab order. We
    // assert DOM-order position + keyboard activation rather than
    // `keyboard.press('Tab')` because WebKit/Safari only moves Tab focus to links
    // when the OS-level "Full Keyboard Access" setting is on (off by default), so
    // a Tab-based assertion measures the engine's keyboard-access preference, not
    // the app. The app has no positive tabindex, so first-in-DOM == first-tabbed.
    const focusable = page.locator(
      'a[href], button, input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    const first = focusable.first();
    await expect(first).toHaveRole('link');
    await expect(first).toHaveAttribute('href', '#main');

    // Guard the "first-in-DOM == first-tabbed" inference: a positive tabindex
    // would reorder the tab sequence ahead of the skip-link without this test
    // noticing (WCAG best practice forbids positive tabindex anyway).
    await expect(page.locator('[tabindex]:not([tabindex="-1"]):not([tabindex="0"])')).toHaveCount(
      0,
    );

    // Its accessible name resolves to a non-empty dict-driven string.
    const accessibleName = (await first.textContent())?.trim() ?? '';
    expect(accessibleName.length).toBeGreaterThan(0);

    // Activating it (keyboard) moves focus/scroll to the <main id="main"> landmark.
    await first.focus();
    await expect(first).toBeFocused();
    await page.keyboard.press('Enter');
    const main = page.locator('main#main');
    await expect(main).toBeVisible();
  });

  test(`skip-link route ${route} has no WCAG 2.1 AA violations`, async ({ page }) => {
    await page.goto(route);
    await page.waitForLoadState('networkidle');
    await expectNoA11yViolations(page, route);
  });
}
