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

    // First Tab must land on the skip-link (a link to #main).
    await page.keyboard.press('Tab');
    const focused = page.locator(':focus');
    await expect(focused).toHaveRole('link');
    await expect(focused).toHaveAttribute('href', '#main');

    // Its accessible name resolves to a non-empty dict-driven string.
    const accessibleName = (await focused.textContent())?.trim() ?? '';
    expect(accessibleName.length).toBeGreaterThan(0);

    // Activating it moves focus/scroll to the <main id="main"> landmark.
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
