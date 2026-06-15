import 'dotenv/config';
import 'reflect-metadata';

import bcrypt from 'bcrypt';

import { AppDataSource } from '@data/db/data-source';
import { User } from '@modules/auth/domain/user/user.entity';
import { BCRYPT_ROUNDS } from '@shared/security/bcrypt';

import { createSmokeAccount } from './seed-smoke-account';

/**
 * Deterministic seed for the FIXED Maestro e2e login account.
 *
 * Why this exists: `museum-frontend/.maestro/helpers/quick-login.yaml` (and every
 * flow that `runFlow`s it) logs in with a STABLE, KNOWN credential pair
 * (`e2e-test-login@test.musaium.dev` / `TestPassword123!`). The old reference
 * `pnpm seed:smoke-account` was reworked (cycle 2026-05-26) into an EPHEMERAL
 * account with a per-run RANDOM password — so it no longer produces the fixed
 * credentials the Maestro suite expects. That drift left the local e2e suite
 * unable to log in (a "false-green" enabler). This script restores a
 * deterministic, verified, consented fixed account for LOCAL e2e only.
 *
 * It reuses `createSmokeAccount` (hard-deletes any same-email residue, inserts a
 * fresh `email_verified=true`, `onboarding_completed=true`, role=`visitor` user
 * WITH the AI consents the chat/TTS happy path needs), then overrides the random
 * password with the fixed Maestro one. Direct DB insert — does NOT go through the
 * HTTP register endpoint, so the password breach-check never applies to seeding.
 *
 * NOT for production: the fixed password is a known test secret. Guarded to
 * non-production by the caller (local docker stack / CI e2e backend only).
 *
 * Quota-exhaustion mode (`E2E_EXHAUST_QUOTA=1`)
 * ────────────────────────────────────────────
 * `museum-frontend/.maestro/modal-paywall-quota-upsell.yaml` drives the REAL
 * soft-paywall trigger: it logs in as a DEDICATED account whose free-tier
 * monthly session quota is already exhausted, then taps "Start a new
 * conversation" → `POST /api/sessions` → 402 `QUOTA_EXCEEDED` → the axios
 * interceptor fires `usePaywall().open()` → `QuotaUpsellModal` mounts (all in a
 * Release bundle — none of that path is `__DEV__`-gated). The flow then HARD-
 * asserts the modal. The old flow deeplinked a `(dev)`-only preview route that
 * redirects Home in a Release build, so the modal never opened and the flow
 * passed green vacuously (stream H7).
 *
 * This mode sets, on the seeded row, the exact state the `monthlySessionQuota`
 * middleware refuses on (`monthly-session-quota.middleware.ts` /
 * `monthly-session-quota.repo.pg.ts` `tryConsume` WHERE clause):
 *   - `tier = 'free'`                          (already the seed default)
 *   - `sessions_month_start = <first-of-current-UTC-month>`  (must MATCH the
 *     middleware's `firstOfCurrentUtcMonth()` — a stale/NULL start lets
 *     `tryConsume` reset the count to 1 and return 201, never a 402)
 *   - `sessions_month_count = <limit>`         (≥ `FREE_TIER_MONTHLY_SESSION_LIMIT`,
 *     default 3 — mirrors the middleware's `resolveLimit()` fallback)
 *
 * Use a SEPARATE email from the default login account: many `museum`-shard flows
 * (museum-picker, nav-stack-deep-links, nav-tabs-roundtrip, modal-museum-sheet,
 * museum-branding-detail) create real chat sessions with the default account, so
 * exhausting ITS quota would 402 them. The dedicated paywall account isolates the
 * exhausted state.
 */
const EMAIL = process.env.E2E_LOGIN_EMAIL ?? 'e2e-test-login@test.musaium.dev';
const PASSWORD = process.env.E2E_LOGIN_PASSWORD ?? 'TestPassword123!';
const EXHAUST_QUOTA = process.env.E2E_EXHAUST_QUOTA === '1';

/**
 * First day of the current UTC month, `YYYY-MM-DD` (the `date`-column form
 * TypeORM stores + the middleware compares against). MUST stay byte-identical to
 * `monthly-session-quota.middleware.ts` `firstOfCurrentUtcMonth()`.
 */
const firstOfCurrentUtcMonthIso = (): string => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
};

/**
 * Free-tier monthly session limit. Mirrors `env.freeTierMonthlySessionLimit`
 * (`config/env.ts`: `FREE_TIER_MONTHLY_SESSION_LIMIT`, default 3) and the
 * middleware's `resolveLimit()` ≤0 fallback to 3, so the seeded count is always
 * ≥ the cap the backend enforces — even if the env var is set on the API process.
 */
const resolveFreeTierLimit = (): number => {
  const raw = Number(process.env.FREE_TIER_MONTHLY_SESSION_LIMIT);
  return Number.isFinite(raw) && raw > 0 ? raw : 3;
};

async function main(): Promise<void> {
  // Explicit opt-in guard. NODE_ENV is NOT a safe discriminator here: the local
  // docker stack runs NODE_ENV=production by design ("prod = stage" pre-launch).
  // Require an explicit flag + a local-looking DB host so this can never seed a
  // known-password account against a remote production database by accident.
  if (process.env.E2E_SEED_ALLOW !== '1') {
    throw new Error('seed-e2e-maestro-account: refusing to run without E2E_SEED_ALLOW=1');
  }
  const dbHost = process.env.DB_HOST ?? '';
  if (!['db', 'localhost', '127.0.0.1'].includes(dbHost)) {
    throw new Error(
      `seed-e2e-maestro-account: DB_HOST="${dbHost}" is not local — refusing (set E2E_SEED_ALLOW=1 only against a local stack)`,
    );
  }

  await AppDataSource.initialize();
  try {
    // Reuse the tested insert path (fresh, verified, consented). Returns a
    // random password we immediately override below.
    const { userId } = await createSmokeAccount(AppDataSource, { email: EMAIL });

    const passwordHash = await bcrypt.hash(PASSWORD, BCRYPT_ROUNDS);
    await AppDataSource.getRepository(User).update({ id: userId }, { password: passwordHash });

    if (EXHAUST_QUOTA) {
      // Force the free-tier monthly session quota to "exhausted" so the very next
      // `POST /api/sessions` returns 402 (the REAL paywall trigger the Maestro
      // flow asserts). Raw SQL on the snake_case columns — `tier` defaults to
      // 'free' from createSmokeAccount, but we set it explicitly to be robust.
      const limit = resolveFreeTierLimit();
      const monthStart = firstOfCurrentUtcMonthIso();
      await AppDataSource.query(
        `UPDATE "users"
            SET "tier" = 'free',
                "sessions_month_count" = $2,
                "sessions_month_start" = $3
          WHERE "id" = $1`,
        [userId, limit, monthStart],
      );
      // eslint-disable-next-line no-console -- one-shot seed CLI, stdout is the contract
      console.log(
        `[seed-e2e-maestro-account] ${EMAIL} ready (id=${userId}, verified, consented, fixed password) ` +
          `— QUOTA EXHAUSTED (tier=free, sessions_month_count=${limit}, sessions_month_start=${monthStart}; next POST /api/sessions → 402)`,
      );
    } else {
      // eslint-disable-next-line no-console -- one-shot seed CLI, stdout is the contract
      console.log(
        `[seed-e2e-maestro-account] ${EMAIL} ready (id=${userId}, verified, consented, fixed password)`,
      );
    }
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console -- one-shot seed CLI error path
  console.error('[seed-e2e-maestro-account] FAILED:', err);
  process.exit(1);
});
