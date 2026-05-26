/**
 * C1A (RED — UFR-022 fresh-context red phase 2026-05-26).
 *
 * Value-level cross-tenant isolation proof for `GET /api/admin/stats` —
 * the load-bearing artefact of slice C1A. A `museum_manager` MUST observe
 * ONLY their own tenant's session/message aggregates, never the global
 * cross-tenant snapshot (OWASP API3:2023 / BOLA).
 *
 * Why integration (real PG + real HTTP, NOT mocked) :
 *   The leak lives in the use-case → repository layer. The route layer
 *   (`admin.route.ts:246-266`) ALREADY force-rewrites `scopedMuseumId =
 *   req.user.museumId` for managers, but `getStats.useCase.ts:24`
 *   (`execute(_input)`) IGNORES its argument and returns
 *   `repository.getStats()` with NO museumId, and
 *   `admin.repository.pg.ts:213-257` (`getStats()`) runs three aggregates
 *   with NO `WHERE museum_id`. The existing call-shape test
 *   (`tests/integration/admin/analytics-scope.test.ts`) MOCKS
 *   `getStatsUseCase.execute`, so the SQL-level leak is invisible to it —
 *   it only asserts the route threads `{ museumId: 42 }`. A value-level
 *   real-DB assertion is the only thing that proves isolation
 *   (spec.md AC-1, design.md §6, UFR-022 anti-mock-the-unit-under-audit).
 *
 * Pattern source (copied structure) :
 *   `tests/integration/support/ticket-museum-id-plumb.test.ts:64-209` —
 *   `RUN_INTEGRATION=true` gate, `createIntegrationHarness()` +
 *   `harness.scheduleStop()` (feedback_integration_test_teardown.md), lazy
 *   import of `@src/app::createApp` + `tests/helpers/auth/token.helpers`
 *   AFTER the harness pins env (otherwise `@src/config/env` freezes
 *   `PGDATABASE` to the non-existent default), `beforeEach(harness.reset)`.
 *
 * Seed plan (distinct counts so an A+B leak is numerically separable from
 * A-only — design.md §6 / tasks.md T1.1) :
 *   - museum 42 (primary tenant) : 2 sessions, 3 messages.
 *   - museum 99 (cross-tenant BOLA target) : 5 sessions, 7 messages.
 *   Global (cross-tenant) sums : 7 sessions, 10 messages.
 *   The harness `reset()` already seeds museums 42 + 99
 *   (integration-harness.ts:88-93), so no museum seeding here.
 *
 * Test discipline (CLAUDE.md §Test Discipline) :
 *   - Shared factories ONLY — `makeSession()` / `makeMessage()` from
 *     `tests/helpers/chat/message.fixtures.ts`, `makeUser()` from
 *     `tests/helpers/auth/user.fixtures.ts`. No inline `as Entity`.
 *   - `id: undefined` override lets Postgres generate the uuid PK
 *     (the factory default `id` would collide across rows).
 *   - `createdAt: new Date()` override so each session falls inside the
 *     7-day `recentSessions` window (the factory default 2025-01-01 would
 *     make recentSessions=0 and break the T1.4 sum assertion).
 *   - `makeToken({ sub, role, museumId })` mints the JWT read by
 *     `isAuthenticated` into `req.user.museumId`
 *     (`authenticated.middleware.ts:84`). No middleware mocking — the JWT
 *     IS the truth source.
 *
 * Frozen-test invariant (UFR-022 phase red) : this file is immutable
 * byte-for-byte once committed. A green agent that suspects a test is wrong
 * MUST emit `BLOCK-TEST-WRONG <path>:<line> <reason>` and let the
 * dispatcher re-spawn a fresh red phase.
 *
 * Lib-docs consulted : `lib-docs/typeorm/PATTERNS.md` (§3.1 Data-Mapper
 * repo.save, §8.4 fixture factories), `lib-docs/pg/PATTERNS.md` (§11
 * integration testcontainer), `lib-docs/express/PATTERNS.md` (§7 supertest
 * + createApp factory).
 *
 * Scoped run :
 *   cd museum-backend && RUN_INTEGRATION=true pnpm test \
 *     --testPathPattern=stats-tenant-isolation --no-coverage --runInBand
 */
import request from 'supertest';

import { ChatMessage } from '@modules/chat/domain/message/chatMessage.entity';
import { ChatSession } from '@modules/chat/domain/session/chatSession.entity';
import { makeMessage, makeSession } from 'tests/helpers/chat/message.fixtures';
import {
  createIntegrationHarness,
  type IntegrationHarness,
} from 'tests/helpers/integration/integration-harness';

import type { Express } from 'express';
import type { Repository } from 'typeorm';

// NB: `tests/helpers/auth/token.helpers` and `@src/app` are NOT imported at
// top-level. Both transitively pull `@src/config/env`, which captures
// `process.env.PGDATABASE` once at module load. The harness must run FIRST so
// it can pin `process.env.PGDATABASE` to the testcontainer's database. Mirrors
// `ticket-museum-id-plumb.test.ts:77-85`.
type MakeToken = (typeof import('tests/helpers/auth/token.helpers'))['makeToken'];

const shouldRunIntegration = process.env.RUN_INTEGRATION === 'true';
const describeIntegration = shouldRunIntegration ? describe : describe.skip;

// Distinct per-tenant seed counts (design.md §6 / tasks.md T1.1).
const MUSEUM_A = 42;
const MUSEUM_B = 99;
const A_SESSIONS = 2;
const A_MESSAGES = 3;
const B_SESSIONS = 5;
const B_MESSAGES = 7;
const GLOBAL_SESSIONS = A_SESSIONS + B_SESSIONS; // 7
const GLOBAL_MESSAGES = A_MESSAGES + B_MESSAGES; // 10

describeIntegration(
  'GET /api/admin/stats — museum_manager tenant isolation (C1A / OWASP API3 BOLA) [integration, real PG + HTTP]',
  () => {
    jest.setTimeout(180_000);

    let harness: IntegrationHarness;
    let app: Express;
    let sessionRepo: Repository<ChatSession>;
    let messageRepo: Repository<ChatMessage>;
    let makeToken: MakeToken;

    beforeAll(async () => {
      harness = await createIntegrationHarness();
      harness.scheduleStop();
      // Lazy import AFTER the harness pins env vars so createApp() and its
      // transitive @src/config/env resolve against the live testcontainer.
      const { createApp } = await import('@src/app');
      const tokenHelpers = await import('tests/helpers/auth/token.helpers');
      makeToken = tokenHelpers.makeToken;
      app = createApp({ healthCheck: async () => ({ database: 'up' }) });
      sessionRepo = harness.dataSource.getRepository(ChatSession);
      messageRepo = harness.dataSource.getRepository(ChatMessage);
    });

    beforeEach(async () => {
      await harness.reset();
      await seedTenant(MUSEUM_A, A_SESSIONS, A_MESSAGES);
      await seedTenant(MUSEUM_B, B_SESSIONS, B_MESSAGES);
    });

    /**
     * Seed `sessionCount` chat sessions for a museum and spread `messageCount`
     * messages across them (all attached to the first seeded session — the
     * `/stats` aggregate counts total messages, not per-session distribution).
     *
     * Uses the shared `makeSession()` / `makeMessage()` factories (ESLint
     * `musaium-test-discipline` exempts factory-call arguments). `id: undefined`
     * forces Postgres to generate the uuid PK; `createdAt: new Date()` keeps the
     * row inside the 7-day `recentSessions` window.
     * @param museumId Tenant id (42 or 99, pre-seeded by the harness).
     * @param sessionCount Number of ChatSession rows to insert for this tenant.
     * @param messageCount Number of ChatMessage rows to insert for this tenant.
     */
    async function seedTenant(
      museumId: number,
      sessionCount: number,
      messageCount: number,
    ): Promise<void> {
      const sessions: ChatSession[] = [];
      for (let i = 0; i < sessionCount; i += 1) {
        const session = await sessionRepo.save(
          makeSession({
            id: undefined,
            museumId,
            museumMode: true,
            intent: 'default',
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        );
        sessions.push(session);
      }
      const anchor = sessions[0];
      for (let i = 0; i < messageCount; i += 1) {
        await messageRepo.save(
          makeMessage({
            id: undefined,
            session: anchor,
            sessionId: anchor.id,
            role: i % 2 === 0 ? 'user' : 'assistant',
            text: `tenant ${String(museumId)} message ${String(i)}`,
            createdAt: new Date(),
          }),
        );
      }
    }

    // ── AC-1 / T1.1 — value-level isolation (LOAD-BEARING) ──────────────────
    it('manager(42) GET /stats → 200 with museum-42 counts ONLY (not the A+B global sum)', async () => {
      const token = makeToken({ sub: '1', role: 'museum_manager', museumId: MUSEUM_A });

      const res = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      // Museum-42 figures ONLY. On baseline the repo ignores museumId and
      // returns the global cross-tenant snapshot (7 sessions / 10 msgs),
      // so these value assertions FAIL — proving the leak.
      expect(res.body.totalSessions).toBe(A_SESSIONS);
      expect(res.body.recentSessions).toBe(A_SESSIONS);
      expect(res.body.totalMessages).toBe(A_MESSAGES);
      // Defensive: must NOT be the global sum.
      expect(res.body.totalSessions).not.toBe(GLOBAL_SESSIONS);
      expect(res.body.totalMessages).not.toBe(GLOBAL_MESSAGES);
    });

    // ── AC-1b / T1.1 (BOLA negative) — query param can never widen scope ────
    it('manager(42) GET /stats?museumId=99 → 200 with museum-42 counts (JWT claim wins, museum 99 never observed)', async () => {
      const token = makeToken({ sub: '1', role: 'museum_manager', museumId: MUSEUM_A });

      const res = await request(app)
        .get(`/api/admin/stats?museumId=${String(MUSEUM_B)}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      // Claim wins — caller sees their own tenant, NEVER museum 99's figures.
      expect(res.body.totalSessions).toBe(A_SESSIONS);
      expect(res.body.totalMessages).toBe(A_MESSAGES);
      expect(res.body.totalSessions).not.toBe(B_SESSIONS);
      expect(res.body.totalMessages).not.toBe(B_MESSAGES);
    });

    // ── AC-4 / T1.2 — manager without a museum claim → 403 ──────────────────
    it('manager with NO museumId claim GET /stats → 403, no aggregate in body', async () => {
      // No museumId override → claim absent from the JWT payload.
      const token = makeToken({ sub: '1', role: 'museum_manager' });

      const res = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${token}`);

      // On baseline the route falls through to execute({}) → global 200
      // snapshot, so this FAILS (expects 403).
      expect(res.status).toBe(403);
      expect(res.body).not.toHaveProperty('totalSessions');
      expect(res.body).not.toHaveProperty('totalMessages');
    });

    // ── AC-2-shape / T1.3 — reduced manager shape omits platform fields ─────
    it('manager(42) GET /stats → response OMITS usersByRole / totalUsers / recentSignups', async () => {
      const token = makeToken({ sub: '1', role: 'museum_manager', museumId: MUSEUM_A });

      const res = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      // On baseline the repo returns the full AdminStats shape (all three
      // platform fields present), so these FAIL — proving the over-exposure.
      expect(res.body).not.toHaveProperty('usersByRole');
      expect(res.body).not.toHaveProperty('totalUsers');
      expect(res.body).not.toHaveProperty('recentSignups');
    });

    // ── AC-3 / T1.4 — global view preserved for super_admin (SENTINEL) ──────
    it('super_admin GET /stats → 200 with the FULL global cross-tenant shape (A+B sums, platform fields present)', async () => {
      const token = makeToken({ sub: '1', role: 'super_admin' });

      const res = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      // Global cross-tenant sums (this is the baseline behaviour → PASSES on
      // baseline; it is the R4 regression sentinel, not a leak proof).
      expect(res.body.totalSessions).toBe(GLOBAL_SESSIONS);
      expect(res.body.totalMessages).toBe(GLOBAL_MESSAGES);
      // Full shape — platform aggregates present for the operator.
      expect(res.body).toHaveProperty('usersByRole');
      expect(res.body).toHaveProperty('totalUsers');
      expect(res.body).toHaveProperty('recentSignups');
    });
  },
);
