import 'dotenv/config';
import 'reflect-metadata';

import bcrypt from 'bcrypt';

import { AppDataSource } from '@data/db/data-source';
import { User } from '@modules/auth/domain/user.entity';

/**
 * Idempotent seed for the post-deploy smoke-test account.
 *
 * Reads SMOKE_TEST_EMAIL + SMOKE_TEST_PASSWORD from env (same vars used by
 * scripts/smoke-api.cjs), ensures the row exists with:
 *   - password hash matching the current secret,
 *   - email_verified = true (post-deploy smoke must login with zero manual
 *     setup; also insulates against future verification_token TTL drifts),
 *   - role = 'visitor' (principle of least privilege; smoke only hits public
 *     endpoints),
 *   - no onboarding gates (onboarding_completed = true).
 *
 * Runs AFTER migrations + app-level seeds, BEFORE smoke-api.cjs, on every prod
 * deploy. Safe to re-run: only updates the fields above; preserves user.id and
 * created_at so audit history + FK references remain stable.
 *
 * Rationale: previously the smoke account drifted out of sync with prod (email
 * unverified after a security sprint hardened login with email_verified gate).
 * The auto-rollback saved the deploy but blocked CI. This script closes the
 * loop so prod deploy is self-healing on smoke credentials.
 */

async function main(): Promise<void> {
  const email = process.env.SMOKE_TEST_EMAIL?.trim();
  const password = process.env.SMOKE_TEST_PASSWORD?.trim();

  if (!email || !password) {
    console.log('seed-smoke-account: SMOKE_TEST_EMAIL/PASSWORD absent — skipping.');
    process.exit(0);
  }

  await AppDataSource.initialize();
  const repo = AppDataSource.getRepository(User);

  const passwordHash = await bcrypt.hash(password, 12);
  const now = new Date();

  const existing = await repo.findOne({ where: { email } });

  if (existing) {
    await repo.update(existing.id, {
      password: passwordHash,
      email_verified: true,
      role: 'visitor',
      onboarding_completed: true,
      updatedAt: now,
      // Clear stale verification state so the smoke account cannot be poisoned
      // by leftover tokens from earlier deploys.
      verification_token: undefined,
      verification_token_expires: undefined,
      reset_token: undefined,
      reset_token_expires: undefined,
    });
    console.log(`seed-smoke-account: updated existing user id=${existing.id}`);
  } else {
    await repo.insert({
      email,
      password: passwordHash,
      firstname: 'Smoke',
      lastname: 'Test',
      role: 'visitor',
      email_verified: true,
      onboarding_completed: true,
      createdAt: now,
      updatedAt: now,
    });
    console.log(`seed-smoke-account: inserted new user email=${email}`);
  }

  await AppDataSource.destroy();
  process.exit(0);
}

main().catch((err) => {
  console.error('seed-smoke-account failed:', err);
  process.exit(1);
});
