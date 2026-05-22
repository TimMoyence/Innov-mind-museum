/**
 * TD-COR-WAVEB-02 (RED — Wave B post-merge correction — UFR-022 fresh-context
 * red phase 2026-05-22).
 *
 * Pins the HTTP-route ↔ use-case plumbing for `museumId` on
 * `POST /api/support/tickets`. Wave B already shipped (HEAD `89d2d7b44`) :
 *
 *   - `support_tickets.museum_id` column + partial index (migration M3).
 *   - `SupportTicket.museumId` entity field + DTO field.
 *   - `SupportRepositoryPg.createTicket` persists `museumId` (line 56-68).
 *   - `CreateTicketInput.museumId?: number | null` typed (support.types.ts:20).
 *   - `ListTicketsFilters.museumId` scope filter (support.types.ts:45).
 *   - `review.route.ts:67` correctly threads `authedUser.museumId ?? null` to
 *     `createReviewUseCase.execute({...})` — mirror pattern.
 *
 * Reviewer Wave B identified the missing link (cf
 * `.claude/skills/team/team-reports/2026-05-21-p0-feature-gates/code-review-wave-b.json`) :
 * `support.route.ts:67-75` builds the `createTicketUseCase.execute(...)` body
 * WITHOUT `museumId`. The JWT `museumId` claim — populated by
 * `isAuthenticated` (`authenticated.middleware.ts:50`) onto `req.user.museumId`
 * — is silently dropped. The use case (`createTicket.useCase.ts:36-43`) then
 * has no `museumId` in scope, so `repository.createTicket(createInput)`
 * receives no `museumId`. Net effect : every ticket created through the
 * production HTTP path ends up with `museum_id = NULL` regardless of the
 * caller's tenant claim. The persistence layer is correct ; the wiring is not.
 *
 * Two regression anchors pinned :
 *
 *   (a) Authenticated user with JWT `museumId = 42` → posted ticket is
 *       persisted with `support_tickets.museum_id = 42` (not NULL).
 *   (b) Authenticated user with no `museumId` claim (visitor, no tenant) →
 *       ticket is persisted with `support_tickets.museum_id = NULL` (the
 *       existing pre-multi-tenant catalog-level behaviour MUST survive).
 *
 * Test discipline (CLAUDE.md §Test Discipline) :
 *   - No inline entity construction. `seedUser()` uses `makeUser()` factory
 *     (mirrors `tests/integration/chat/chat-repository-typeorm.integration.test.ts:52-69`).
 *   - `harness.scheduleStop()` not `harness.stop()`
 *     (feedback_integration_test_teardown.md).
 *   - `RUN_INTEGRATION=true` gate mirrors `ticket-museum-scope.test.ts:63-64`.
 *   - `makeToken({ sub, role, museumId })` to mint a JWT that exercises the
 *     real `isAuthenticated` middleware → `authSessionService.verifyAccessToken`
 *     → `req.user.museumId` set from claim. No middleware mocking — the JWT
 *     IS the truth source for `req.user.museumId`.
 *
 * Why integration (real PG + real route) :
 *   The contract being pinned spans (a) JWT verify path, (b) route handler
 *   plumbing, (c) use-case input shape, (d) repository INSERT. A unit test
 *   that mocks the use case (cf `tests/unit/routes/support.route.test.ts:245-273`)
 *   would only assert the route → useCase boundary AND cannot detect
 *   reintroduction of the bug at the useCase → repository layer
 *   (the very seam the reviewer flagged at the use-case body). End-to-end
 *   against PG is the cheapest test that closes both seams in one shot.
 *
 * Frozen-test invariant (UFR-022 phase red) : this file is immutable
 * byte-for-byte once committed. A green agent that suspects a test is wrong
 * MUST emit `BLOCK-TEST-WRONG <path>:<line> <reason>` and let the dispatcher
 * re-spawn a fresh red phase.
 *
 * Scoped run :
 *   cd museum-backend && RUN_INTEGRATION=true pnpm test \
 *     --testPathPattern=ticket-museum-id-plumb --no-coverage --runInBand
 */
import request from 'supertest';

import { User } from '@modules/auth/domain/user/user.entity';
import { SupportTicket } from '@modules/support/domain/ticket/supportTicket.entity';
import { makeUser } from 'tests/helpers/auth/user.fixtures';
import {
  createIntegrationHarness,
  type IntegrationHarness,
} from 'tests/helpers/integration/integration-harness';

import type { Express } from 'express';
import type { Repository } from 'typeorm';

// NB: `tests/helpers/auth/token.helpers` and `@src/app` are NOT imported at
// top-level. Both transitively pull `@src/config/env`, which captures
// `process.env.PGDATABASE` once at module load. The harness must run FIRST so
// it can pin `process.env.PGDATABASE` to the testcontainer's database (the
// `setupFiles` jest-env-pgdatabase.setup.ts default of `museum_test` does not
// exist on the container). A top-level import would freeze env to the default
// and any data-source query would die with `database "museum_test" does not
// exist`. Mirrors `post-message-c2-enrichment.integration.test.ts:158-211`.
type MakeToken = (typeof import('tests/helpers/auth/token.helpers'))['makeToken'];

const shouldRunIntegration = process.env.RUN_INTEGRATION === 'true';
const describeIntegration = shouldRunIntegration ? describe : describe.skip;

describeIntegration(
  'POST /api/support/tickets — museumId plumb (TD-COR-WAVEB-02) [integration, real PG + HTTP]',
  () => {
    jest.setTimeout(180_000);

    let harness: IntegrationHarness;
    let app: Express;
    let ticketRepo: Repository<SupportTicket>;
    let makeToken: MakeToken;

    beforeAll(async () => {
      harness = await createIntegrationHarness();
      harness.scheduleStop();
      // Lazy import AFTER the harness pins env vars (PG host/port, JWT_*),
      // so `createApp()` and its transitive `@src/config/env` resolve against
      // the live testcontainer. Mirrors
      // `tests/integration/chat/post-message-c2-enrichment.integration.test.ts:209`.
      const { createApp } = await import('@src/app');
      const tokenHelpers = await import('tests/helpers/auth/token.helpers');
      makeToken = tokenHelpers.makeToken;
      app = createApp({ healthCheck: async () => ({ database: 'up' }) });
      ticketRepo = harness.dataSource.getRepository(SupportTicket);
    });

    beforeEach(async () => {
      await harness.reset();
    });

    /**
     * Persist a User row via the shared factory and return its assigned id.
     * Mirrors `tests/integration/chat/chat-repository-typeorm.integration.test.ts:52-69`.
     * The `support_tickets.userId` column has a FK to `users.id` (cf
     * migration `1774400100000-CreateSupportTables.ts:24`), so the user MUST
     * exist before the route handler's `createTicket` INSERT fires.
     *
     * @param overrides Optional User-field overrides forwarded to makeUser.
     * @returns Numeric user id assigned by Postgres.
     */
    async function seedUser(overrides: Parameters<typeof makeUser>[0] = {}): Promise<number> {
      const userRepo = harness.dataSource.getRepository(User);
      const fixture = makeUser(overrides);
      const saved = await userRepo.save(
        userRepo.create({
          email: fixture.email,
          password: fixture.password,
          firstname: fixture.firstname,
          lastname: fixture.lastname,
          role: fixture.role,
          museumId: fixture.museumId ?? null,
          email_verified: fixture.email_verified,
          onboarding_completed: fixture.onboarding_completed,
          contentPreferences: fixture.contentPreferences,
        }),
      );
      return saved.id;
    }

    it('persists museum_id = 42 when caller JWT carries museumId = 42 (R-C7c)', async () => {
      // Seed a user with the museum-42 tenant attachment so the JWT claim is
      // not a fabrication — mirrors the production login flow where
      // authSessionService.issueAccessToken pulls museumId from the user row
      // (token-jwt.service.ts:44).
      const userId = await seedUser({
        email: 'tenant42-author@test.dev',
        museumId: 42,
      });

      const token = makeToken({
        sub: String(userId),
        role: 'visitor',
        museumId: 42,
      });

      const res = await request(app)
        .post('/api/support/tickets')
        .set('Authorization', `Bearer ${token}`)
        .send({
          subject: 'tenant 42 — needs help',
          description: 'description with at least ten chars for validator',
        });

      // 201 from route handler (chat.route.ts pattern).
      expect(res.status).toBe(201);
      const created = res.body.ticket as { id: string };
      expect(typeof created.id).toBe('string');

      // FAIL at HEAD `89d2d7b44` : the route does not pass museumId →
      // useCase does not pass museumId → repo persists NULL. The runtime
      // assertion is the load-bearing red signal.
      const row = await ticketRepo.findOneByOrFail({ id: created.id });
      expect(row.museumId).toBe(42);
    });

    it('persists museum_id = NULL when caller JWT has no museumId claim (catalog-level survives)', async () => {
      // Visitor without a tenant attachment — pre-multi-tenant behaviour.
      const userId = await seedUser({ email: 'no-tenant-author@test.dev' });

      // No museumId override → claim absent from JWT payload.
      const token = makeToken({ sub: String(userId), role: 'visitor' });

      const res = await request(app)
        .post('/api/support/tickets')
        .set('Authorization', `Bearer ${token}`)
        .send({
          subject: 'unscoped — generic help',
          description: 'description with at least ten chars for validator',
        });

      expect(res.status).toBe(201);
      const created = res.body.ticket as { id: string };

      const row = await ticketRepo.findOneByOrFail({ id: created.id });
      // Wave B kept the column nullable on purpose (supportTicket.entity.ts:46)
      // — pre-multi-tenant tickets MUST remain unscoped. Asserting `null` here
      // (not `undefined`) because TypeORM materialises a missing nullable
      // integer column as JS `null`.
      expect(row.museumId).toBeNull();
    });
  },
);
