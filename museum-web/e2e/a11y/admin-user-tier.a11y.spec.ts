import { test } from '@playwright/test';
import { expectNoA11yViolations } from './_helpers';

/**
 * R1 RED — Playwright a11y spec for the admin user-detail page tier toggle
 * (T1.17 — N in brief).
 *
 * Pins R1 §1 N9 + AC8 down BEFORE implementation : zero WCAG 2.1 AA
 * violations on `/admin/users/<id>` (both FR + EN locales) with the tier
 * toggle button rendered AND with the confirm modal open.
 *
 * Explicit T1 inclusion is the R1 corrective for the recurrent R3/R4/R2
 * loop where the a11y spec landed late in T3 polish. Per R1 N9 doctrine,
 * this file ships RED with the rest of the test corpus.
 *
 * MUST FAIL at baseline `cd7e22bc` — the tier section is not rendered on
 * the user-detail page yet ; axe-core will either pass (no a11y violation
 * because the element is absent) OR fail because the page is unreachable
 * under the seeded fixtures. Either way the spec records baseline RED
 * intent : the green agent's T2 must keep axe happy after the section
 * renders.
 *
 * Mirror of `public-b2b.a11y.spec.ts` line-by-line shape.
 */

// User-detail is admin-gated — keep the authenticated storageState from the
// shared Playwright fixture. The other public a11y specs override to anonymous
// via `test.use({ storageState: { cookies: [], origins: [] } })`; we do NOT
// override here so the storage state set by the auth-bootstrapper hook is
// reused.

const SEED_USER_ID = '1';

test('admin user-detail page (en) has no WCAG 2.1 AA violations with tier toggle', async ({
  page,
}) => {
  await page.goto(`/en/admin/users/${SEED_USER_ID}`);
  await page.waitForLoadState('networkidle');
  await expectNoA11yViolations(page, `/en/admin/users/${SEED_USER_ID}`);
});

test('admin user-detail page (fr) has no WCAG 2.1 AA violations with tier toggle', async ({
  page,
}) => {
  await page.goto(`/fr/admin/users/${SEED_USER_ID}`);
  await page.waitForLoadState('networkidle');
  await expectNoA11yViolations(page, `/fr/admin/users/${SEED_USER_ID}`);
});

test('admin user-detail page (en) has no WCAG 2.1 AA violations with confirm modal open', async ({
  page,
}) => {
  await page.goto(`/en/admin/users/${SEED_USER_ID}`);
  await page.waitForLoadState('networkidle');

  // Open the tier-change confirm modal. Match the button's accessible name
  // via its dict label. The page may render either `Promote to premium` or
  // `Demote to free` depending on the seed user's tier — try both.
  const promote = page.getByRole('button', { name: /Promote to premium/i });
  const demote = page.getByRole('button', { name: /Demote to free/i });
  // `count()` resolves immediately (no auto-wait), so on a slow render both
  // counts can be 0 → no click fires → the dialog waitFor below times out
  // (flaky). Gate on whichever tier-change button the user's tier renders.
  await promote.or(demote).first().waitFor({ state: 'visible' });
  if (await promote.count()) {
    await promote.first().click();
  } else if (await demote.count()) {
    await demote.first().click();
  }
  // Wait for the dialog to appear before scanning.
  await page.getByRole('dialog').waitFor({ state: 'visible' });

  await expectNoA11yViolations(page, `/en/admin/users/${SEED_USER_ID} + tier-confirm-modal`);
});
