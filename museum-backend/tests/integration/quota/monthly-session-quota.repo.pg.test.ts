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

function monthStartUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 12));
}

function previousMonthStartUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1, 12));
}

describeIntegration(
  'PgMonthlyQuotaRepo.tryConsume — persistence contract [integration, real PG]',
  () => {
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
