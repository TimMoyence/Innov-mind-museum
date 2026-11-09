import 'dotenv/config';
import 'reflect-metadata';

import bcrypt from 'bcrypt';

import { AppDataSource } from '@data/db/data-source';
import { User } from '@modules/auth/domain/user/user.entity';
import { BCRYPT_ROUNDS } from '@shared/security/bcrypt';

import { createSmokeAccount } from './seed-smoke-account';

const EMAIL = process.env.E2E_LOGIN_EMAIL ?? 'e2e-test-login@test.musaium.dev';
const PASSWORD = process.env.E2E_LOGIN_PASSWORD ?? 'TestPassword123!';
const EXHAUST_QUOTA = process.env.E2E_EXHAUST_QUOTA === '1';

const firstOfCurrentUtcMonthIso = (): string => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
};

const resolveFreeTierLimit = (): number => {
  const raw = Number(process.env.FREE_TIER_MONTHLY_SESSION_LIMIT);
  return Number.isFinite(raw) && raw > 0 ? raw : 3;
};

async function main(): Promise<void> {
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
    const { userId } = await createSmokeAccount(AppDataSource, { email: EMAIL });

    const passwordHash = await bcrypt.hash(PASSWORD, BCRYPT_ROUNDS);
    await AppDataSource.getRepository(User).update({ id: userId }, { password: passwordHash });

    if (EXHAUST_QUOTA) {
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
      console.log(
        `[seed-e2e-maestro-account] ${EMAIL} ready (id=${userId}, verified, consented, fixed password) ` +
          `— QUOTA EXHAUSTED (tier=free, sessions_month_count=${limit}, sessions_month_start=${monthStart}; next POST /api/sessions → 402)`,
      );
    } else {
      console.log(
        `[seed-e2e-maestro-account] ${EMAIL} ready (id=${userId}, verified, consented, fixed password)`,
      );
    }
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((err: unknown) => {
  console.error('[seed-e2e-maestro-account] FAILED:', err);
  process.exit(1);
});
