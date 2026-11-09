import request from 'supertest';

import {
  createIntegrationHarness,
  type IntegrationHarness,
} from 'tests/helpers/integration/integration-harness';

import type { ChatService } from '@modules/chat/useCase/orchestration/chat.service';
import type { MonthlyQuotaRepo } from '@shared/middleware/monthly-session-quota.middleware';
import type { User } from '@modules/auth/domain/user/user.entity';
import type { Express } from 'express';
import type { Repository } from 'typeorm';

const shouldRunIntegration =
  process.env.RUN_E2E === 'true' || process.env.RUN_INTEGRATION === 'true';
const describeIntegration = shouldRunIntegration ? describe : describe.skip;

function monthStartUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 12));
}

const FORCED_HANDLER_ERROR = new Error('forced create-session failure (integration H12)');

const mockCreateSession = jest.fn();
const mockChatService: Partial<ChatService> = {
  createSession: mockCreateSession,
  listSessions: jest.fn(),
  getSession: jest.fn(),
  deleteSessionIfEmpty: jest.fn(),
  postMessage: jest.fn(),
  reportMessage: jest.fn(),
  getMessageImageRef: jest.fn(),
  setMessageFeedback: jest.fn(),
};

describeIntegration(
  'monthly-session-quota — 5xx-after-consume MUST NOT inflate the persisted counter [integration, real PG]',
  () => {
    const now = new Date();
    const currentMonthStart = monthStartUtc(now);

    let harness: IntegrationHarness;
    let userRepo: Repository<User>;
    let app: Express;

    let UserEntity: typeof import('@modules/auth/domain/user/user.entity').User;
    let setMonthlyQuotaRepo: (next: MonthlyQuotaRepo | null) => void;
    let makeUser: typeof import('tests/helpers/auth/user.fixtures').makeUser;
    let makeToken: typeof import('tests/helpers/auth/token.helpers').makeToken;
    let resetRateLimits: () => void;
    let stopRateLimitSweep: () => void;

    beforeAll(async () => {
      harness = await createIntegrationHarness();
      harness.scheduleStop();

      const middlewareMod = await import('@shared/middleware/monthly-session-quota.middleware');
      const { PgMonthlyQuotaRepo } =
        await import('@shared/middleware/monthly-session-quota.repo.pg');
      const { createApp } = await import('@src/app');
      const userEntityMod = await import('@modules/auth/domain/user/user.entity');
      const userFixtureMod = await import('tests/helpers/auth/user.fixtures');
      const tokenMod = await import('tests/helpers/auth/token.helpers');
      const routeSetupMod = await import('tests/helpers/http/route-test-setup');

      UserEntity = userEntityMod.User;
      setMonthlyQuotaRepo = middlewareMod.setMonthlyQuotaRepo;
      makeUser = userFixtureMod.makeUser;
      makeToken = tokenMod.makeToken;
      resetRateLimits = routeSetupMod.resetRateLimits;
      stopRateLimitSweep = routeSetupMod.stopRateLimitSweep;

      userRepo = harness.dataSource.getRepository(UserEntity);

      const realRepo = new PgMonthlyQuotaRepo(harness.dataSource);
      setMonthlyQuotaRepo(realRepo);

      app = createApp({
        chatService: mockChatService as ChatService,
        healthCheck: async () => ({ database: 'up' }),
      });
    });

    beforeEach(async () => {
      await harness.reset();
      resetRateLimits();
      jest.clearAllMocks();
      mockCreateSession.mockRejectedValue(FORCED_HANDLER_ERROR);
    });

    afterAll(() => {
      setMonthlyQuotaRepo(null);
      stopRateLimitSweep();
    });

    it('UC-H12-01: free-tier count=0, Zod-valid POST consumes then handler 5xx-throws → persisted sessions_month_count MUST be back at 0 (RED: it is inflated to 1)', async () => {
      const seeded = await userRepo.save(
        makeUser({
          id: 1,
          email: 'h12-revert-on-5xx@test.musaium.dev',
          tier: 'free',
          sessionsMonthCount: 0,
          sessionsMonthStart: currentMonthStart,
        }),
      );

      const token = makeToken({ sub: String(seeded.id) });

      const res = await request(app)
        .post('/api/chat/sessions')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(500);
      expect(mockCreateSession).toHaveBeenCalledTimes(1);

      const after = await userRepo.findOneByOrFail({ id: seeded.id });
      expect(after.sessionsMonthCount).toBe(0);
    });
  },
);
