import 'dotenv/config';
import 'reflect-metadata';

import bcrypt from 'bcrypt';

import { AppDataSource } from '@data/db/data-source';
import { User } from '@modules/auth/domain/user/user.entity';
import { BCRYPT_ROUNDS } from '@shared/security/bcrypt';
import { hashEmailTokenForLookup } from '@shared/security/single-use-email-token';

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
 * Magic-link token modes (`E2E_SEED_VERIFY_TOKEN=1`, `E2E_SEED_EMAIL_CHANGE=1`)
 * ────────────────────────────────────────────────────────────────────────────
 * `magic-link-verify-email.yaml` and `magic-link-confirm-email-change.yaml` were
 * VACUOUS: every assertion in them carried `optional: true`, so neither flow could
 * fail. They counted as UFR-021 coverage (the sentinel matches the route literal)
 * while proving nothing but "the app did not crash on launch". Their own headers
 * admitted why — "no local mechanism seeds such tokens" — so the assertions had
 * been relaxed until they meant nothing.
 *
 * There is no need to mock anything. Both endpoints look the user up by the SHA-256
 * DIGEST of the raw token (`hashEmailTokenForLookup`, single-use-email-token.ts) and
 * require a live expiry:
 *
 *   verifyEmail:              WHERE verification_token   = :hash AND verification_token_expires > NOW()
 *   consumeEmailChangeToken:  WHERE email_change_token   = :hash AND email_change_token_expiry  > NOW()
 *
 * So we seed the DIGEST of a token the flow already carries, through the very same
 * helper production uses — the backend cannot tell it is being tested, and it runs
 * its real validation. Reimplementing the sha256 here would fork the source of truth
 * and drift silently the day the hashing changes.
 *
 * Both tokens are SINGLE-USE (the repositories NULL them on consume), so this must
 * be re-seeded before every suite run. `maestro-run-shard.sh` does exactly that.
 *
 * BLAST RADIUS — the two are NOT alike:
 *   - verify-email is harmless on the shared login account: it re-marks an already
 *     verified row as verified and clears the token.
 *   - confirm-email-change is DESTRUCTIVE: `consumeEmailChangeToken` sets
 *     `email = pending_email` and the use case then revokes every refresh token the
 *     user holds. Pointing it at the shared account would rename it mid-suite and
 *     sign it out — every later flow would fail to log in. It therefore MUST be
 *     seeded on a DEDICATED throwaway account. The screen is a public route (no auth
 *     needed — the token identifies the user), so the flow never logs in as it and
 *     the damage stays contained.
 */
const SEED_VERIFY_TOKEN = process.env.E2E_SEED_VERIFY_TOKEN === '1';
const SEED_EMAIL_CHANGE = process.env.E2E_SEED_EMAIL_CHANGE === '1';
const SEED_RESET_TOKEN = process.env.E2E_SEED_RESET_TOKEN === '1';

/** Raw tokens the Maestro deep-links carry. Kept in sync with the flow YAMLs. */
const VERIFY_TOKEN_RAW = process.env.E2E_VERIFY_TOKEN ?? 'e2e-verify-token';
// These three defaults are the literals the deep-links already carry — the flow
// YAML is the contract, this script follows it:
//   magic-link-verify-email.yaml:37         ?token=e2e-verify-token
//   magic-link-reset-password.yaml:40       ?token=e2e-reset-token
//   magic-link-confirm-email-change.yaml:37 ?token=e2e-confirm-token
const EMAIL_CHANGE_TOKEN_RAW = process.env.E2E_EMAIL_CHANGE_TOKEN ?? 'e2e-confirm-token';
const RESET_TOKEN_RAW = process.env.E2E_RESET_TOKEN ?? 'e2e-reset-token';

/** Where `confirm-email-change` moves the dedicated account's address to. */
const EMAIL_CHANGE_PENDING = process.env.E2E_EMAIL_CHANGE_PENDING ?? 'e2e-changed@test.musaium.dev';

/** 24h — the same window `register.useCase.ts` gives a real verification link. */
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

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

    // Raw SQL on the snake_case columns, and NOT `repo.update()`: TypeORM's
    // `.set()`/`update()` path silently SKIPS `undefined` and has a documented
    // history of no-op'ing these very columns (see the verifyEmail comment in
    // user.repository.pg.ts:116). A seed that silently writes nothing would hand
    // the flow an invalid token and send us hunting a phantom app bug.
    const tokenExpiry = new Date(Date.now() + TOKEN_TTL_MS);

    if (SEED_VERIFY_TOKEN) {
      await AppDataSource.query(
        `UPDATE "users"
            SET "verification_token" = $2,
                "verification_token_expires" = $3
          WHERE "id" = $1`,
        [userId, hashEmailTokenForLookup(VERIFY_TOKEN_RAW), tokenExpiry],
      );
    }

    if (SEED_RESET_TOKEN) {
      // `resetPassword.useCase.ts:31` hashes with `{ trim: false }` — the raw token
      // is digested VERBATIM. A token carrying stray whitespace would hash to
      // something the endpoint never looks up, so keep RESET_TOKEN_RAW whitespace-free.
      //
      // DESTRUCTIVE, like the email change: `consumeResetTokenAndUpdatePassword`
      // REPLACES the account's password. Seeding this on the shared login account
      // would invalidate TestPassword123! mid-suite and every later flow would fail
      // to log in. Dedicated throwaway account only.
      await AppDataSource.query(
        `UPDATE "users"
            SET "reset_token" = $2,
                "reset_token_expires" = $3
          WHERE "id" = $1`,
        [userId, hashEmailTokenForLookup(RESET_TOKEN_RAW, { trim: false }), tokenExpiry],
      );
    }

    if (SEED_EMAIL_CHANGE) {
      await AppDataSource.query(
        `UPDATE "users"
            SET "pending_email" = $2,
                "email_change_token" = $3,
                "email_change_token_expiry" = $4
          WHERE "id" = $1`,
        [
          userId,
          EMAIL_CHANGE_PENDING,
          hashEmailTokenForLookup(EMAIL_CHANGE_TOKEN_RAW),
          tokenExpiry,
        ],
      );
    }

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
      // Name the magic-link tokens in stdout. They are single-use and invisible in
      // the DB (only their digest is stored), so a run that silently seeded none is
      // indistinguishable from one that seeded both — until a flow fails and someone
      // spends an hour blaming the app.
      const seeded = [
        SEED_VERIFY_TOKEN ? `verify-email token="${VERIFY_TOKEN_RAW}"` : null,
        SEED_RESET_TOKEN ? `reset-password token="${RESET_TOKEN_RAW}"` : null,
        SEED_EMAIL_CHANGE
          ? `email-change token="${EMAIL_CHANGE_TOKEN_RAW}" → pending_email=${EMAIL_CHANGE_PENDING}`
          : null,
      ].filter(Boolean);

      // eslint-disable-next-line no-console -- one-shot seed CLI, stdout is the contract
      console.log(
        `[seed-e2e-maestro-account] ${EMAIL} ready (id=${userId}, verified, consented, fixed password)` +
          (seeded.length > 0 ? ` — SEEDED ${seeded.join(', ')} (24h, single-use)` : ''),
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
