/**
 * T1.2 (RED — UFR-022 fresh-context red phase, run 2026-06-01-quota-tuple-402).
 *
 * Pins the persistence contract of `PgMonthlyQuotaRepo.tryConsume`
 * (`src/shared/middleware/monthly-session-quota.repo.pg.ts`) against a REAL
 * Postgres (integration-harness testcontainer), so the EXACT TypeORM 0.3.28
 * return shape of `UPDATE … RETURNING` (`[rows[], affectedCount]`, lib-docs/
 * typeorm/PATTERNS.md §4.10 + LESSONS.md 2026-05-08) is exercised — not a fake.
 *
 * This is the fidelity counterpart to the unit tuple-replay test: a stub could
 * mis-model the driver (the very gap UFR-017 punishes); real pg cannot.
 *
 * RED reason at baseline (current buggy code reads `result[0]` as a row):
 *   - AC1: user free at count = limit (same month) → the WHERE refuses (0 rows),
 *     `query()` returns `[[], 0]`, but the code returns a truthy object instead
 *     of `null`. `expect(...).toBeNull()` FAILS → suite exit ≠ 0 (under
 *     RUN_INTEGRATION=true). After the green fix it returns `null`.
 *
 * Gated identically to all integration peers (`RUN_INTEGRATION === 'true'` →
 * `describe`, else `describe.skip`) so the standard `pnpm test` gate is NOT
 * affected by this suite (it runs via `pnpm test:integration`).
 *
 * Maps: AC1 (limit → null + row not incremented), AC2 (consume → count+1, valid
 * Date), AC3 (month rollover → reset to 1).
 *
 * Test discipline (CLAUDE.md): users seeded via `makeUser()` factory
 * (`tests/helpers/auth/user.fixtures.ts`) + `getRepository(User).save(...)`; no
 * inline entity literals. Teardown via `harness.scheduleStop()` (never `.stop()`,
 * per `feedback_integration_test_teardown`).
 */
import { PgMonthlyQuotaRepo } from '@shared/middleware/monthly-session-quota.repo.pg';
import {
  createIntegrationHarness,
  type IntegrationHarness,
} from 'tests/helpers/integration/integration-harness';
import { makeUser } from 'tests/helpers/auth/user.fixtures';

import { User } from '@modules/auth/domain/user/user.entity';

import type { Repository } from 'typeorm';

const shouldRunIntegration = process.env.RUN_INTEGRATION === 'true';
const describeIntegration = shouldRunIntegration ? describe : describe.skip;

/**
 * First day (UTC) of the month containing `d`, as a Date at 00:00:00.000Z.
 * @param d Any date within the target month.
 * @returns A Date pinned to the 1st of that month at UTC midnight.
 */
function monthStartUtc(d: Date): Date {
  // Noon UTC (not midnight) so the value's LOCAL calendar day equals its UTC day
  // in every realistic runner timezone (UTC-11..UTC+11). The Postgres `date`
  // column round-trips through LOCAL midnight while the repo compares the month
  // boundary via toISOString() (UTC); a midnight-UTC seed desynced the two in
  // behind-UTC zones (e.g. EDT made the seed land on the previous day) and the
  // WHERE clause took the rollover branch instead of refusing. Noon removes the
  // boundary. CI/prod (UTC) is unaffected.
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 12));
}

/**
 * First day (UTC) of the month BEFORE the one containing `d`.
 * @param d Any date within the reference month.
 * @returns A Date pinned to the 1st of the previous month at UTC midnight.
 */
function previousMonthStartUtc(d: Date): Date {
  // Noon UTC — see monthStartUtc for the timezone-portability rationale.
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1, 12));
}

describeIntegration(
  'PgMonthlyQuotaRepo.tryConsume — persistence contract [integration, real PG]',
  () => {
    jest.setTimeout(180_000);

    const LIMIT = 3;
    const now = new Date();
    const currentMonthStart = monthStartUtc(now);
    const previousMonthStart = previousMonthStartUtc(now);

    let harness: IntegrationHarness;
    let repo: PgMonthlyQuotaRepo;
    let userRepo: Repository<User>;

    beforeAll(async () => {
      harness = await createIntegrationHarness();
      harness.scheduleStop();
      repo = new PgMonthlyQuotaRepo(harness.dataSource);
      userRepo = harness.dataSource.getRepository(User);
    });

    beforeEach(async () => {
      await harness.reset();
    });

    describe('AC1 — free user at the limit (same month) is refused', () => {
      it('returns null and leaves sessions_month_count unchanged at the limit', async () => {
        const seeded = await userRepo.save(
          makeUser({
            id: 1,
            email: 'free-at-limit@test.musaium.dev',
            tier: 'free',
            sessionsMonthCount: LIMIT,
            sessionsMonthStart: currentMonthStart,
          }),
        );

        const result = await repo.tryConsume(seeded.id, currentMonthStart, LIMIT);

        expect(result).toBeNull();

        const after = await userRepo.findOneByOrFail({ id: seeded.id });
        expect(after.sessionsMonthCount).toBe(LIMIT);
      });
    });

    describe('AC2 — free user under the limit consumes one session', () => {
      it('returns count+1 with a valid Date and increments the DB row', async () => {
        const seeded = await userRepo.save(
          makeUser({
            id: 2,
            email: 'free-under-limit@test.musaium.dev',
            tier: 'free',
            sessionsMonthCount: 1,
            sessionsMonthStart: currentMonthStart,
          }),
        );

        const result = await repo.tryConsume(seeded.id, currentMonthStart, LIMIT);

        expect(result).not.toBeNull();
        expect(result?.sessionsMonthCount).toBe(2);
        expect(result?.sessionsMonthStart).toBeInstanceOf(Date);
        expect(
          Number.isNaN((result as { sessionsMonthStart: Date }).sessionsMonthStart.getTime()),
        ).toBe(false);

        const after = await userRepo.findOneByOrFail({ id: seeded.id });
        expect(after.sessionsMonthCount).toBe(2);
      });
    });

    describe('AC3 — month rollover resets the counter to 1', () => {
      it('resets count to 1 and moves the start to the current month', async () => {
        const seeded = await userRepo.save(
          makeUser({
            id: 3,
            email: 'free-rollover@test.musaium.dev',
            tier: 'free',
            sessionsMonthCount: LIMIT,
            sessionsMonthStart: previousMonthStart,
          }),
        );

        const result = await repo.tryConsume(seeded.id, currentMonthStart, LIMIT);

        expect(result).not.toBeNull();
        expect(result?.sessionsMonthCount).toBe(1);
        // Business intent: the start is reset to the 1st of the *current* month.
        // The repo stores + returns sessions_month_start as the UTC calendar day
        // it computed (currentMonthStart.toISOString().slice(0,10)), so assert on
        // that SAME UTC basis. A prior local-components comparison was off-by-one
        // against the UTC-anchored value in behind-UTC runners (e.g. EDT).
        const utcDay = (d: Date): string => new Date(d).toISOString().slice(0, 10);
        const expectedCurrentMonthFirst = currentMonthStart.toISOString().slice(0, 10);
        expect(utcDay((result as { sessionsMonthStart: Date }).sessionsMonthStart)).toBe(
          expectedCurrentMonthFirst,
        );

        const after = await userRepo.findOneByOrFail({ id: seeded.id });
        expect(after.sessionsMonthCount).toBe(1);
        expect(utcDay(new Date(after.sessionsMonthStart!))).toBe(expectedCurrentMonthFirst);
      });
    });
  },
);
