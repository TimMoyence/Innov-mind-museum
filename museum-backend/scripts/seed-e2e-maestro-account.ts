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
 */
const EMAIL = process.env.E2E_LOGIN_EMAIL ?? 'e2e-test-login@test.musaium.dev';
const PASSWORD = process.env.E2E_LOGIN_PASSWORD ?? 'TestPassword123!';

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

    // eslint-disable-next-line no-console -- one-shot seed CLI, stdout is the contract
    console.log(`[seed-e2e-maestro-account] ${EMAIL} ready (id=${userId}, verified, consented, fixed password)`);
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console -- one-shot seed CLI error path
  console.error('[seed-e2e-maestro-account] FAILED:', err);
  process.exit(1);
});
