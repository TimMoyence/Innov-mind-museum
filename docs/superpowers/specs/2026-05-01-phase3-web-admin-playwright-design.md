# Phase 3 — Web Admin Playwright + Real Axe A11y (Design Spec)

- **Status**: Proposed (2026-05-01)
- **Owner**: QA/SDET
- **Scope**: museum-web + `.github/workflows/ci-cd-web.yml`
- **Pre-req for**: nothing (independent of Phases 4–8)
- **Estimated effort**: 1 working week
- **Spec lineage**: Phase 0 ADR-012 + ADR-007 (coverage policy) + this Phase 3 brings web admin from "0 e2e + 0 real a11y" to "real Playwright suite + axe-core enforced"

## 1. Problem Statement

`museum-web` ships an admin panel with 11 routes (login, dashboard, users, audit-logs, analytics, reviews, reports, support, tickets, mfa, layout) and a public marketing site. Today:

- **Zero Playwright tests.** All web tests are Vitest unit tests against React components in isolation. No flow exercises the admin login → list users → audit a moderation action contract end to end.
- **No real a11y verification.** The "a11y" tests in the Vitest suite use Testing Library role-query patterns — they catch some shape regressions but never run an actual axe-core ruleset. A user with a screen reader hitting a real CSS-rendered page would surface defects the unit tests can't see.
- **CI today:** `quality` job (lint + build + Vitest tests + Trivy fs scan) → `lighthouse` on PR. No e2e step. No accessibility scanner.

Phase 3 closes both gaps: a Playwright suite covering the auth boundary + 4 admin flows on Chromium per PR (Firefox + WebKit nightly), plus real axe-core scans of 6 critical routes (3 public + 3 admin).

## 2. Goals

1. Stand up `museum-web/playwright.config.ts` + a storageState-based auth fixture (login once at `globalSetup`, reuse for every test).
2. Land 4 admin flow specs:
   - `admin-login.spec.ts` (the only test that actually exercises the login UI; it's also the producer of the cached `storageState.json`).
   - `admin-users.spec.ts` (list users + filter + view detail).
   - `admin-audit-logs.spec.ts` (list audit events + filter by actor + filter by date).
   - `admin-reports-moderation.spec.ts` (list reports + moderate one + assert state transition).
3. Land 6 a11y specs running real axe-core via `@axe-core/playwright`:
   - 3 public: `/en` (landing), `/en/support`, `/en/privacy`.
   - 3 admin: `/en/admin/login`, `/en/admin` (dashboard), `/en/admin/users`.
   Each spec asserts zero violations of the WCAG 2.1 AA ruleset OR exits with a categorised list of violations.
4. Wire a new `playwright` CI job in `ci-cd-web.yml` running on PR (Chromium only) + nightly cron (Firefox + WebKit + full a11y).
5. Use the same docker-compose stack on the runner that Phase 2 uses for Maestro (Postgres + backend on `localhost:3000`).
6. Seed an admin user via a Playwright `globalSetup` script that POSTs to `/api/auth/register` then upgrades the user's role via direct DB INSERT (admin role isn't normally registerable via the public route).
7. CLAUDE.md updated with the new pipeline.

## 3. Non-Goals

- **Cross-locale a11y coverage** (FR mirrors EN; testing one locale is sufficient for Phase 3).
- **Visual regression / screenshot diff testing** (Lighthouse already partially covers; out of scope).
- **Replace Vitest unit tests** — they stay; Playwright is additive.
- **Mobile WebKit on PR** — nightly only.
- **Public-staging integration** — same V2 deferral as Phase 2.
- **Test the admin React Native or backend module** — those are Phase 1 / 5 territory.

## 4. Architecture

### 4.1 Directory layout

```
museum-web/
├── playwright.config.ts                  (new)
├── e2e/                                   (new)
│   ├── fixtures/
│   │   ├── auth.ts                        (storageState helpers + admin-user seeder)
│   │   └── docker-compose.ts              (boot/teardown helpers)
│   ├── flows/
│   │   ├── admin-login.spec.ts
│   │   ├── admin-users.spec.ts
│   │   ├── admin-audit-logs.spec.ts
│   │   └── admin-reports-moderation.spec.ts
│   ├── a11y/
│   │   ├── public-landing.a11y.spec.ts
│   │   ├── public-support.a11y.spec.ts
│   │   ├── public-privacy.a11y.spec.ts
│   │   ├── admin-login.a11y.spec.ts
│   │   ├── admin-dashboard.a11y.spec.ts
│   │   └── admin-users.a11y.spec.ts
│   ├── global-setup.ts                    (boot backend + seed admin + login + save storageState)
│   ├── global-teardown.ts                 (stop backend)
│   └── playwright-storage/                (gitignored — generated storageState.json lives here)
└── package.json                           (modified — add playwright deps + scripts)
```

### 4.2 `playwright.config.ts` shape

```ts
import { defineConfig, devices } from '@playwright/test';

const isCI = process.env.CI === 'true';
const browsers = process.env.PW_BROWSERS?.split(',') ?? ['chromium'];

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 2 : undefined,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : 'list',
  globalSetup: require.resolve('./e2e/global-setup'),
  globalTeardown: require.resolve('./e2e/global-teardown'),
  use: {
    baseURL: process.env.WEB_BASE_URL ?? 'http://localhost:3001',
    storageState: 'e2e/playwright-storage/storageState.json',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: browsers.map((name) => ({
    name,
    use: { ...devices[name === 'chromium' ? 'Desktop Chrome' : name === 'firefox' ? 'Desktop Firefox' : 'Desktop Safari'] },
  })),
});
```

`PW_BROWSERS=chromium` (PR default) vs `PW_BROWSERS=chromium,firefox,webkit` (nightly).

### 4.3 Auth fixture (`storageState`)

`e2e/global-setup.ts`:

```ts
import { chromium, request, FullConfig } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';

const STORAGE_PATH = resolve(__dirname, 'playwright-storage', 'storageState.json');
const ADMIN_EMAIL = `e2e-admin-${Date.now()}@test.musaium.dev`;
const ADMIN_PASSWORD = 'AdminTest123!';

async function seedAdminUser(): Promise<void> {
  // 1. Register via the real public endpoint (covers password hashing + email sanitisation).
  const ctx = await request.newContext();
  const reg = await ctx.post('http://localhost:3000/api/auth/register', {
    data: {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      firstname: 'E2E',
      lastname: 'Admin',
      gdprConsent: true,
    },
  });
  if (!reg.ok()) throw new Error(`Admin registration failed: ${await reg.text()}`);

  // 2. Promote to admin via direct DB UPDATE (the production flow requires a separate admin to grant roles).
  const pg = new Client({
    host: 'localhost', port: 5433, user: 'museum_dev', password: 'museum_dev_password', database: 'museum_dev',
  });
  await pg.connect();
  await pg.query("UPDATE users SET role = 'admin', email_verified = true WHERE email = $1", [ADMIN_EMAIL]);
  await pg.end();
  await ctx.dispose();
}

async function loginAndSaveStorage(): Promise<void> {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('http://localhost:3001/en/admin/login');
  await page.getByLabel(/email/i).fill(ADMIN_EMAIL);
  await page.getByLabel(/password/i).fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /log in|sign in/i }).click();
  await page.waitForURL(/\/en\/admin(\/|$)/, { timeout: 15_000 });

  mkdirSync(resolve(__dirname, 'playwright-storage'), { recursive: true });
  await context.storageState({ path: STORAGE_PATH });
  await browser.close();
}

export default async function globalSetup(_config: FullConfig): Promise<void> {
  await seedAdminUser();
  await loginAndSaveStorage();
  // Expose creds to specs via env in case they need a second logged-in identity.
  process.env.ADMIN_E2E_EMAIL = ADMIN_EMAIL;
  process.env.ADMIN_E2E_PASSWORD = ADMIN_PASSWORD;
}
```

The `globalTeardown.ts` is a no-op for now (CI workflow stops docker-compose explicitly). Container cleanup via runner GC.

The seeded admin email includes a timestamp, so re-runs against the same DB state don't collide. `harness.reset()` semantics from Phase 1 don't apply here because Phase 3 uses a long-lived backend across the suite.

### 4.4 Flow specs (Pattern: storageState reuse)

Every spec under `e2e/flows/` automatically receives the saved `storageState`, so the test starts already-logged-in:

```ts
import { test, expect } from '@playwright/test';

test('admin can list and filter users', async ({ page }) => {
  await page.goto('/en/admin/users');
  await expect(page.getByRole('heading', { name: /users/i })).toBeVisible();
  await page.getByLabel(/search/i).fill('e2e-admin');
  await expect(page.getByRole('row').filter({ hasText: 'e2e-admin' })).toHaveCount(1);
});
```

Exception: `admin-login.spec.ts` does NOT use storageState. It exercises the login UI directly — verifies the contract that produced storageState in the first place.

### 4.5 a11y specs (Real axe-core)

```ts
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('admin login page is WCAG 2.1 AA compliant', async ({ page }) => {
  await page.goto('/en/admin/login');
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();

  expect(results.violations).toEqual([]);
});
```

If a route has known violations that cannot be fixed in Phase 3 scope (e.g., a Tailwind colour contrast on a brand component owned by another team), document them in a per-route `disableRules: ['color-contrast']` array with a justification comment AND a `@TODO` linking to a follow-up issue.

The 6 a11y specs run against a fresh page load each — no storageState — except the 3 admin pages, which need the logged-in session.

### 4.6 Backend boot strategy

Same docker-compose stack as Phase 2's Maestro pipeline. The Phase 2 helper `museum-frontend/scripts/maestro-runner-setup.sh` boots Postgres + backend; Phase 3 needs the same. **DRY**: extract the shared boot logic into a top-level `scripts/test-stack-up.sh` and call it from both Phase 2 (`maestro-runner-setup.sh` becomes a thin wrapper) and Phase 3 (`e2e/fixtures/docker-compose.ts` shells out to it).

For Phase 3's first cut, the simpler path is to copy-paste the boot fragment from `maestro-runner-setup.sh` into `e2e/fixtures/docker-compose.ts` — the consolidation work is its own follow-up commit. Decision: **inline copy** for Phase 3 Commit A; refactor to shared script in Phase 3 Commit D as a cleanup before merge.

### 4.7 CI job graph

```
quality (existing — lint + build + Vitest + Trivy)
  │
  └── playwright-pr (new, ubuntu-latest, conditional)
        if: github.event_name == 'pull_request'
        ─ boot docker-compose (Postgres + backend)
        ─ run Next.js dev server on port 3001
        ─ run `pnpm playwright test --project=chromium` (4 flow specs + 3 public a11y + 3 admin a11y)
  │
  └── playwright-nightly (new, ubuntu-latest)
        if: github.event_name == 'schedule'
        ─ same boot
        ─ run `pnpm playwright test` with PW_BROWSERS=chromium,firefox,webkit (matrix on browsers)
        ─ uploads HTML report as artifact
  │
  └── lighthouse (existing — unchanged)
```

The PR job runs only chromium, takes ~5–7 min wall-clock (boot ~2min + tests ~3–4min).
The nightly job runs all 3 browsers sequentially (~12–15 min).

### 4.8 Coverage gate stays unchanged

ADR-007 says vitest coverage thresholds activate after Bloc C5 (10 admin tests) lands. Phase 3 ships 4 admin flows + 6 a11y specs — that is **not** the same as the 10 Vitest unit tests Bloc C5 referenced. Phase 3 does NOT touch the Vitest coverage gate; the 70/60/70/70 threshold continues to be enforced once the unit-test-side Bloc C5 lands separately.

### 4.9 Tier classification (ADR-012)

Per ADR-012, Playwright tests live in `museum-web/e2e/` and qualify as e2e (full Next.js + real backend + DB). The Phase 0 sentinel runs against `museum-backend/tests/integration/` only; no extension needed for the web tier today. If the BE sentinel pattern proves valuable, a parallel `web-tier-signature` could be added in Phase 8 — out of scope for Phase 3.

## 5. Security

- The seeded admin user uses a synthetic email + a known-but-throwaway password. The DB UPDATE bypass (admin role via SQL) is acceptable in test-only scope; production has no equivalent.
- `storageState.json` contains a real JWT issued against the test backend. Gitignored; never persisted to repo.
- `ADMIN_E2E_PASSWORD` lives in env vars during the job; not surfaced to logs.
- a11y violations may include sensitive copy if a route is logged-in; ensure axe reports are uploaded as workflow artifacts, not echoed to PR comments.

## 6. Risks & Mitigations

### Risk: Playwright is flaky

Web e2e tests are notoriously flake-prone due to timing.

**Mitigation:** Standard Playwright defaults (auto-waiting on locators, `webServer` config to wait for server-ready). `retries: 1` in CI. If flake rate > 5% over the first 2 weeks, escalate to `retries: 2` or per-spec `test.slow()` markers.

### Risk: docker-compose boot exceeds runner timeout

Same risk as Phase 2.

**Mitigation:** Same 120s timeout pattern as Phase 2. If too tight, increase. If too brittle, fall back to GH Actions `services:` block running Postgres directly.

### Risk: a11y violations in existing components require coordination across teams

axe-core may flag colour-contrast issues, missing landmarks, missing labels, non-unique heading hierarchies, etc. Some are quick fixes; some require design buy-in.

**Mitigation:** First Phase 3 PR runs the a11y specs against a temp `disableRules: [...]` block listing every flagged rule, with a one-line justification per rule + a tracking issue. The list shrinks over time. Cap test enforces it can only shrink (mirrors Phase 1 baseline pattern).

### Risk: admin promotion via direct DB UPDATE breaks if user schema changes

The `UPDATE users SET role = 'admin'` SQL is fragile to migration changes.

**Mitigation:** Wrap in a single helper function `seedAdminUser()` so the SQL lives in one place. If migrations change the column name, update one file. The migration round-trip test from Phase 1 catches schema drift in the DB; the e2e harness just needs the column-name update.

### Risk: Phase 2 Maestro pipeline already uses docker-compose at port 3000; concurrent jobs collide

Phase 2's `maestro-shard` jobs run on macos-latest; Phase 3's `playwright-pr` runs on ubuntu-latest. Different runners, different host networks — no port conflict.

If a future change moves Phase 3 to macos for browser-test parity, port collision becomes a real issue. Tracked as Phase 3 follow-up.

### Risk: parallel-session interference (still ongoing)

Same anti-leak protocol as Phases 0/1/2. Each implementer subagent dispatched with explicit `git restore --staged .` ritual.

## 7. Acceptance Criteria

Phase 3 is **done** when ALL hold:

- [ ] `museum-web/playwright.config.ts` exists with chromium/firefox/webkit projects + a `PW_BROWSERS` env-var driven enable.
- [ ] `museum-web/e2e/global-setup.ts` boots an admin user (registration + DB UPDATE + login) and saves `storageState.json`.
- [ ] 4 flow specs land under `museum-web/e2e/flows/`, all green against the local docker-compose backend.
- [ ] 6 a11y specs land under `museum-web/e2e/a11y/`, all asserting zero violations OR a documented `disableRules` list with justifications.
- [ ] `pnpm playwright test` runs locally (with docker-compose up) green.
- [ ] `.github/workflows/ci-cd-web.yml` declares `playwright-pr` (PR + Chromium) and `playwright-nightly` (cron + chromium+firefox+webkit) jobs.
- [ ] `museum-web/.gitignore` excludes `e2e/playwright-storage/` and `e2e/test-results/`.
- [ ] `museum-web/package.json` exposes `pnpm test:e2e` script.
- [ ] CLAUDE.md updated with a Phase 3 subsection.
- [ ] `pnpm lint` (web) exits 0; existing Vitest tests still green.
- [ ] Phase 3 lands as 4 commits (Commit A / B / C / D).

## 8. Phase 3 Commit Decomposition

4 commits, sequenced:

1. **Commit A** — Playwright setup: deps + config + global-setup/teardown + auth fixture + first smoke (`admin-login.spec.ts`).
2. **Commit B** — 3 remaining admin flow specs (users, audit-logs, reports-moderation).
3. **Commit C** — 6 a11y specs + initial `disableRules` baseline + cap test.
4. **Commit D** — CI wiring (`playwright-pr` + `playwright-nightly` jobs) + CLAUDE.md update + DRY refactor of docker-compose boot fragment.

## 9. Resolved decisions (2026-05-01)

- **Q1 = A** (Chromium PR + Firefox+WebKit nightly).
- **Q2 = i** (docker-compose backend on runner).
- **Q3 = b** (storageState login-once, reuse).
- **Q4 = z** (6 a11y routes — 3 public + 3 admin).

No remaining open questions. Ready for plan generation.
