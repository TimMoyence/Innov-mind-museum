/**
 * STREAM H12 — RED (UFR-022 fresh-context red phase).
 *
 * UC-H12-01 (revert-on-5xx, Tier=integration, Category=regression) materialized.
 *
 * This is the integration realization of the `it.todo` at
 * `tests/unit/routes/chat-session-quota-ordering.test.ts:176`
 * ("F1.Risk1 V1.1 — handler 5xx after counter increment leaves counter
 * inflated"). The unit ordering test mocks `MonthlyQuotaRepo`, so it can only
 * assert call-counts — it can NOT prove that the persisted
 * `users.sessions_month_count` row reverted. Per the contract Tier=integration
 * because the revert must hit a REAL Postgres row: this is precisely the
 * `INSERT…/UPDATE…RETURNING` tuple-shape bug-class UFR-017 punishes, where a
 * mock would mis-model the driver and give a fake green.
 *
 * GROUND TRUTH (verified at HEAD, files cited):
 *  - Route mount: `POST /api/chat/sessions` (chat-session.route.ts:103-120)
 *    with middleware chain `isAuthenticated → validateBody(createSessionSchema)
 *    → monthlySessionQuota → handler`.
 *  - The quota middleware consumes the slot via the REAL atomic
 *    `UPDATE … RETURNING` (`monthly-session-quota.repo.pg.ts:43-60`) and calls
 *    `next()` on a non-null consume (`monthly-session-quota.middleware.ts:167-172`).
 *  - On a non-null consume the persisted `sessions_month_count` is incremented
 *    BEFORE the handler runs. If the handler then throws, the error middleware
 *    maps an unknown throw to HTTP 500 (`error.middleware.ts:130`).
 *  - At HEAD there is NO compensating decrement: the inflated counter stays
 *    inflated. That is the bug this RED test proves.
 *
 * RED EXPECTATION (against the CURRENT un-compensated middleware):
 *  - Seed a free-tier user with sessions_month_count=0 (current UTC month).
 *  - POST a Zod-valid body whose stubbed `chatService.createSession` throws a
 *    plain Error → 500.
 *  - The quota middleware already consumed → DB row is now at 1.
 *  - We SELECT `sessions_month_count` from the real `users` row and assert it
 *    is STILL 0. At HEAD it is 1 → `expect(after).toBe(0)` FAILS RED.
 *  - After the GREEN compensation (a >=500-scoped, consume-armed, floor-guarded,
 *    month-scoped revert) is implemented, the row returns to 0 and this passes.
 *
 * Gating: `RUN_E2E || RUN_INTEGRATION` → real testcontainer (integration-harness),
 * else `describe.skip` so the standard `pnpm test` gate is unaffected. Mirrors
 * the sibling repo-level test `monthly-session-quota.repo.pg.test.ts`.
 *
 * Lazy-import discipline: every `@src`-touching module (createApp, the quota
 * middleware/repo, the token + user fixtures) is imported via `await import`
 * INSIDE `beforeAll`, AFTER `createIntegrationHarness()` has set the
 * container env vars. `@src/config/env` captures `process.env.PGDATABASE`
 * EAGERLY at module load (env.ts:93), so a top-level import would freeze the
 * DB name to the default `museum_test` BEFORE the harness rebinds it to the
 * testcontainer DB → "database museum_test does not exist". This is the same
 * env-capture sequencing the real-PG precedent
 * `tests/integration/chat/post-message-c2-enrichment.integration.test.ts:161-211`
 * uses.
 *
 * Test discipline (CLAUDE.md): user seeded via `makeUser()` factory + real
 * `getRepository(User).save(...)`; no inline entity literals. Teardown via
 * `harness.scheduleStop()` (never `.stop()`, per feedback_integration_test_teardown).
 *
 * Frozen-test invariant (UFR-022 phase red): this file is immutable byte-for-byte
 * once committed. A green agent that suspects a test is wrong MUST emit
 * `BLOCK-TEST-WRONG <path>:<line> <reason>` and let the dispatcher re-spawn a
 * fresh red phase — never edit it from a green/reviewer phase.
 *
 * Scoped run:
 *   cd museum-backend && RUN_INTEGRATION=true pnpm exec jest --watchman=false \
 *     --coverage=false --runInBand \
 *     --testPathPattern=monthly-session-quota-inflation
 */
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

/**
 * First day (UTC) of the month containing `d`, at noon UTC.
 *
 * Noon (not midnight) so the value's LOCAL calendar day equals its UTC day in
 * every realistic runner timezone — see the identical helper in the sibling
 * `monthly-session-quota.repo.pg.test.ts` for the full timezone rationale (a
 * midnight-UTC seed desyncs the `date` column round-trip from the repo's
 * `toISOString()` UTC comparison in behind-UTC runners). CI/prod (UTC) is
 * unaffected.
 */
function monthStartUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 12));
}

/** Forces the create handler down the 5xx error path. */
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
    jest.setTimeout(180_000);

    // Free-tier limit is the env default (resolveLimit() → 3); the test never
    // needs to reference it directly — it drives a single create then a forced
    // 5xx, well under the cap.
    const now = new Date();
    const currentMonthStart = monthStartUtc(now);

    let harness: IntegrationHarness;
    let userRepo: Repository<User>;
    let app: Express;

    // Lazily-resolved `@src` surface (imported AFTER the harness sets env).
    let UserEntity: typeof import('@modules/auth/domain/user/user.entity').User;
    let setMonthlyQuotaRepo: (next: MonthlyQuotaRepo | null) => void;
    let makeUser: typeof import('tests/helpers/auth/user.fixtures').makeUser;
    let makeToken: typeof import('tests/helpers/auth/token.helpers').makeToken;
    let resetRateLimits: () => void;
    let stopRateLimitSweep: () => void;

    beforeAll(async () => {
      // 1) Boot the testcontainer FIRST — this sets process.env.PGDATABASE et al
      //    and dynamically imports + initializes AppDataSource against it.
      harness = await createIntegrationHarness();
      harness.scheduleStop();

      // 2) NOW import the `@src`-touching modules so `env.ts` captures the
      //    container DB name (not the default `museum_test`).
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

      // REAL repo against the testcontainer — NOT the mock used in
      // chat-session-quota-ordering.test.ts. The consume + (future) revert MUST
      // hit a real users row for this to prove anything.
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
      // Handler always throws → 500 (error.middleware.ts:130 maps unknown
      // throws to 500). The quota middleware has, by then, already consumed.
      mockCreateSession.mockRejectedValue(FORCED_HANDLER_ERROR);
    });

    afterAll(() => {
      setMonthlyQuotaRepo(null);
      stopRateLimitSweep();
    });

    it('UC-H12-01: free-tier count=0, Zod-valid POST consumes then handler 5xx-throws → persisted sessions_month_count MUST be back at 0 (RED: it is inflated to 1)', async () => {
      // Seed a fresh free-tier user, count=0, this UTC month.
      const seeded = await userRepo.save(
        makeUser({
          id: 1,
          email: 'h12-revert-on-5xx@test.musaium.dev',
          tier: 'free',
          sessionsMonthCount: 0,
          sessionsMonthStart: currentMonthStart,
        }),
      );

      // makeToken default sub='1' → authenticated.middleware sets req.user.id=1
      // (Number(decoded.sub)); seed id MUST match.
      const token = makeToken({ sub: String(seeded.id) });

      const res = await request(app)
        .post('/api/chat/sessions')
        .set('Authorization', `Bearer ${token}`)
        .send({}); // empty body is zod-valid for createSessionSchema

      // The quota middleware consumed (next() was called), the handler threw,
      // the error middleware mapped it to 500.
      expect(res.status).toBe(500);
      // Sanity: the handler was actually reached (proves the consume happened
      // BEFORE the throw — i.e. the slot really was burned).
      expect(mockCreateSession).toHaveBeenCalledTimes(1);

      // THE INVARIANT (UC-H12-01 / INV-1+INV-2): a 5xx after consume MUST leave
      // the persisted counter at its pre-request value. At HEAD there is no
      // compensating decrement → the row is inflated to 1 → this FAILS RED.
      const after = await userRepo.findOneByOrFail({ id: seeded.id });
      expect(after.sessionsMonthCount).toBe(0);
    });
  },
);
