/**
 * T-B6 (RED — Wave B / C9 — UFR-022 fresh-context red phase 2026-05-21).
 *
 * Spec : `team-state/2026-05-21-p0-feature-gates/spec.md` R-C9 + decisions.md
 * D-C9 ("museum_manager: AJOUTER + SCOPER" — add to AdminShell allow-list,
 * scope museumId per tenant).
 *
 * Asserts that a `museum_manager` user can :
 *   (1) navigate to `/[locale]/admin` WITHOUT being 403'd by the RoleGuard
 *       (currently `museum-web/src/components/admin/AdminShell.tsx:196` —
 *       `allowedRoles={['admin','moderator','super_admin']}` — EXCLUDES
 *       museum_manager).
 *   (2) see the AuthenticatedLayout (admin shell) rendered, not the
 *       `RoleGuard` 403 fallback (`museum-web/src/lib/auth.tsx:278-294`
 *       renders "403" + `adminDict.accessDenied`).
 *   (3) the rendered admin page passes `@axe-core/playwright` WCAG 2.1 AA
 *       (a11y non-regression — UFR / NFR Accessibility).
 *
 * Baseline (HEAD `89d2d7b44`) — RoleGuard verdict for a museum_manager :
 *   `user.role === 'super_admin' || ['admin','moderator','super_admin'].includes('museum_manager')`
 *   = `false || false` = `false`
 *   → RoleGuard renders the 403 + accessDenied fallback (auth.tsx:278-294)
 *   → AuthenticatedLayout never mounts
 *   → tests (1) + (2) BOTH fail.
 *
 * Test layout note (UFR-013 honesty — divergence from brief path) :
 *   Brief T-B6 says `museum-web/tests/e2e/admin/museum-manager-access.spec.ts`,
 *   but the Playwright config `museum-web/playwright.config.ts:14` pins
 *   `testDir: './e2e'`. A spec at `museum-web/tests/e2e/...` would be
 *   IGNORED by `pnpm test:e2e` / `pnpm test:a11y` and would NEVER run in CI.
 *   This file therefore lives at `museum-web/e2e/admin/museum-manager-access.spec.ts`
 *   (under the configured `testDir`) — the manifest + final red report
 *   call out this divergence so the green agent knows where the spec
 *   actually is.
 *
 * Test runner expectations :
 *   - Requires `museum-backend` + `museum-web` dev servers running locally
 *     (or via CI compose) — same prerequisite as every existing spec under
 *     `museum-web/e2e/` (cf. `playwright.config.ts:24`
 *     `baseURL: process.env.WEB_BASE_URL ?? 'http://localhost:3001'`).
 *   - `globalSetup` (`e2e/global-setup.ts:48-51`) seeds a SUPER_ADMIN user
 *     by default. This spec re-seeds a fresh user as `museum_manager` and
 *     logs them in via the API, OVERRIDING the default storageState
 *     (mirrors the `storageState: { cookies: [], origins: [] }` pattern
 *     from `e2e/flows/admin-login.spec.ts:5`).
 *   - Will fail if the dev stack is not running — same failure mode as
 *     every other `museum-web/e2e/**` spec. The red phase's success
 *     criterion is the ASSERTION failure (RoleGuard 403), not the stack
 *     bootstrap.
 *
 * If Playwright is not installed locally (the @playwright/test +
 * @axe-core/playwright deps are pinned in `museum-web/package.json` per
 * `pnpm install`), this file will fail to import — that ALSO satisfies
 * the red criterion ("test exists, fails until green").
 */
import { test, expect, request } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomBytes } from 'node:crypto';
import { Client } from 'pg';

// Override the storageState (super_admin from globalSetup) — this spec
// drives a fresh museum_manager session.
test.use({ storageState: { cookies: [], origins: [] } });

interface SeededUser {
  email: string;
  password: string;
}

/**
 * Register + role-promote a fresh user to `museum_manager`. Mirrors the
 * `seedAdminUser` helper in `e2e/global-setup.ts:12-55` (same backend
 * /api/auth/register call + same `UPDATE users SET role = ?` via the
 * `pg` client) but promotes to museum_manager instead of super_admin and
 * returns the credentials for in-spec login.
 */
async function seedMuseumManager(): Promise<SeededUser> {
  const email = `e2e-mgr-${Date.now()}-${randomBytes(4).toString('hex')}@test.musaium.dev`;
  // Per-run random password — defeats backend HIBP breach check (same
  // rationale as `e2e/global-setup.ts:104-108`).
  const password = `E2e!${randomBytes(32).toString('hex')}A`;

  const apiBase = process.env.API_BASE_URL ?? 'http://localhost:3000';
  const ctx = await request.newContext();
  try {
    const reg = await ctx.post(`${apiBase}/api/auth/register`, {
      data: {
        email,
        password,
        // Letters-only — backend validator rejects digits in given/family
        // names (cf. `e2e/global-setup.ts:21-23`).
        firstname: 'MuseumManagerE2e',
        lastname: 'PlaywrightTest',
        gdprConsent: true,
        // `dateOfBirth` became required (P0.A2 DOB age-gate, commit 77c5e81b2);
        // mirror `e2e/global-setup.ts:28` seedAdminUser. Was missing here →
        // register 400 "dateOfBirth … chaîne attendu, indéfini reçu".
        dateOfBirth: '1990-01-01',
      },
    });
    if (!reg.ok()) {
      throw new Error(`museum_manager registration failed (${reg.status()}): ${await reg.text()}`);
    }
  } finally {
    await ctx.dispose();
  }

  const pg = new Client({
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? '5433'),
    user: process.env.DB_USER ?? 'museum_dev',
    password: process.env.DB_PASSWORD ?? 'museum_dev_password',
    database: process.env.PGDATABASE ?? 'museum_dev',
  });
  await pg.connect();
  try {
    await pg.query(
      "UPDATE users SET role = 'museum_manager', email_verified = true WHERE email = $1",
      [email],
    );
  } finally {
    await pg.end();
  }

  return { email, password };
}

test.describe('AdminShell — museum_manager access (T-B6 — R-C9 / D-C9)', () => {
  test('museum_manager navigates to /en/admin without 403 + AdminShell renders + axe AA clean', async ({
    page,
    context,
    baseURL,
  }) => {
    const { email, password } = await seedMuseumManager();
    const apiBase = process.env.API_BASE_URL ?? 'http://localhost:3000';

    // API-driven login (mirrors `e2e/global-setup.ts:67-99` — UI form was
    // historically flaky in CI for storageState propagation).
    const loginRes = await context.request.post(`${apiBase}/api/auth/login`, {
      data: { email, password },
    });
    expect(
      loginRes.ok(),
      `museum_manager login failed (${loginRes.status()}): ${await loginRes.text()}`,
    ).toBe(true);

    // The browser-side `setAdminAuthzCookie()` (`museum-web/src/lib/auth.tsx:31`)
    // sets this cookie after a successful login; in the API-only path we
    // set it ourselves so the Edge middleware does not redirect the
    // navigation (cf. global-setup.ts:81-93 for the canonical shape).
    const url = new URL(baseURL ?? 'http://localhost:3001');
    await context.addCookies([
      {
        name: 'admin-authz',
        value: '1',
        domain: url.hostname,
        path: '/',
        sameSite: 'Lax',
        expires: Math.floor(Date.now() / 1000) + 60 * 60 * 1,
        httpOnly: false,
        secure: url.protocol === 'https:',
      },
    ]);

    await page.goto('/en/admin');
    await page.waitForLoadState('networkidle');

    // (1) + (2) AdminShell rendered — NOT the RoleGuard 403 fallback.
    //
    // The 403 fallback (`museum-web/src/lib/auth.tsx:278-294`) renders the
    // literal text "403" + `adminDict.accessDenied` ("Access Denied" in
    // EN, "Accès refusé" in FR per `museum-web/src/dictionaries/en.json`
    // / `fr.json`). FAIL at baseline because museum_manager is NOT in
    // `AdminShell.tsx:196` allow-list.
    await expect(
      page.getByText('403', { exact: true }),
      'RoleGuard 403 fallback must NOT be rendered for museum_manager (R-C9)',
    ).toHaveCount(0);
    await expect(
      page.getByText(/access denied/i),
      'RoleGuard accessDenied fallback must NOT be rendered for museum_manager (R-C9)',
    ).toHaveCount(0);

    // Positive signal: any anchor pointing into the admin shell sub-pages
    // (`/en/admin/...`) — the AuthenticatedLayout sidebar / shell renders
    // these. We do not pin a specific page label here to avoid coupling
    // to i18n strings; the structural assertion ("some admin link exists")
    // proves AuthenticatedLayout mounted.
    await expect(
      page.locator('a[href^="/en/admin/"]').first(),
      'AdminShell AuthenticatedLayout must render at least one admin nav link',
    ).toBeVisible({ timeout: 10_000 });

    // (3) WCAG 2.1 AA scan — non-regression a11y guard.
    // Mirrors `museum-web/e2e/a11y/_helpers.ts:29-37` (withTags wcag2a +
    // wcag2aa + wcag21aa). Inline here (not via _helpers.expectNoA11yViolations)
    // because that helper hard-codes routes against a JSON disable list and
    // /en/admin is not pre-registered there.
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });
});
