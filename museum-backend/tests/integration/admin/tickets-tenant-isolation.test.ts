/**
 * C1B (RED — UFR-022 fresh-context red phase 2026-05-26).
 *
 * Value-level cross-tenant isolation proof for the admin TICKETS surface —
 * the load-bearing artefact of slice C1B (tickets half). A `museum_manager`
 * MUST observe and update ONLY their own tenant's support tickets, never
 * another museum's nor the global NULL-museum rows (OWASP API3:2023 / BOLA —
 * read side `GET /api/admin/tickets` + the higher-severity write side
 * `PATCH /api/admin/tickets/:id`).
 *
 * Why integration (real PG + real HTTP, NOT mocked) :
 *   `listTickets` ALREADY filters on `t.museumId`
 *   (`support.repository.pg.ts:102-104`) but the admin facade + use-case drop
 *   the scope (`listAllTickets.useCase.ts:14-19` has no `museumId`) →
 *   cross-tenant list. The PATCH path is worse: `updateTicketStatus.useCase.ts`
 *   calls `updateTicket()` BLIND — no read-before-write, no ownership guard
 *   (`updateTicketStatus.useCase.ts:37`). A manager could mutate another
 *   tenant's ticket state by guessing the id. The RBAC matrix MOCKS the
 *   facades, so neither the scope leak nor the missing write guard is visible
 *   to it. Only a value-level real-DB assertion proves isolation
 *   (spec-c1b.md AC-1 / AC-3, design-c1b.md §6).
 *
 * Pattern source : `tests/integration/admin/stats-tenant-isolation.test.ts`
 * (C1A precedent) + `tests/integration/support/ticket-museum-scope.test.ts`
 * (the repo seed path that persists `museum_id`). `RUN_INTEGRATION=true`
 * gate, `createIntegrationHarness()` + `harness.scheduleStop()`
 * (feedback_integration_test_teardown.md), lazy `createApp` + `token.helpers`
 * import AFTER the harness pins env, `beforeEach(harness.reset)` seeds
 * museums 42 + 99.
 *
 * Test discipline (CLAUDE.md §Test Discipline) :
 *   - Tickets are seeded through the REAL `SupportRepositoryPg.createTicket`
 *     (its own create path persists `museum_id` — `support.repository.pg.ts:56`),
 *     not inline `as Entity` — mirrors `ticket-museum-scope.test.ts:84-107`.
 *   - `makeToken({ sub, role, museumId })` mints the JWT read into
 *     `req.user.museumId`. No middleware mocking.
 *
 * Baseline failure (tip `1dc5306d5` ancestor — tickets unchanged) :
 *   `GET`/`PATCH /api/admin/tickets` are `requireRole('admin','moderator')`
 *   → every `museum_manager` call 403s ≠ the asserted 200 (LIST) / 404
 *   (foreign PATCH) / 200 (own PATCH). AND no PATCH ownership guard exists.
 *   FAILS.
 *
 * Frozen-test invariant (UFR-022 phase red) : immutable byte-for-byte once
 * committed. Suspect a test is wrong → `BLOCK-TEST-WRONG <path>:<line>
 * <reason>`, never edit.
 *
 * Lib-docs consulted : `lib-docs/typeorm/PATTERNS.md` (repo read-back),
 * `lib-docs/pg/PATTERNS.md` (§11 integration testcontainer),
 * `lib-docs/express/PATTERNS.md` (§7 supertest + createApp factory).
 *
 * Scoped run :
 *   cd museum-backend && RUN_INTEGRATION=true pnpm test \
 *     --testPathPattern=tickets-tenant-isolation --no-coverage --runInBand
 */
import request from 'supertest';

import { SupportRepositoryPg } from '@modules/support/adapters/secondary/pg/support.repository.pg';
import { SupportTicket } from '@modules/support/domain/ticket/supportTicket.entity';
import {
  createIntegrationHarness,
  type IntegrationHarness,
} from 'tests/helpers/integration/integration-harness';

import type { CreateTicketInput } from '@modules/support/domain/ticket/support.types';
import type { Express } from 'express';
import type { Repository } from 'typeorm';

// Lazy-import contract: see stats-tenant-isolation.test.ts:80-85.
type MakeToken = (typeof import('tests/helpers/auth/token.helpers'))['makeToken'];

const shouldRunIntegration = process.env.RUN_INTEGRATION === 'true';
const describeIntegration = shouldRunIntegration ? describe : describe.skip;

const MUSEUM_A = 42; // manager's tenant (primary)
const MUSEUM_B = 99; // cross-tenant BOLA target

describeIntegration(
  'admin /tickets — museum_manager tenant isolation (C1B / OWASP API3 BOLA) [integration, real PG + HTTP]',
  () => {
    jest.setTimeout(180_000);

    let harness: IntegrationHarness;
    let app: Express;
    let supportRepo: SupportRepositoryPg;
    let ticketRepo: Repository<SupportTicket>;
    let makeToken: MakeToken;

    // Per-test seeded ids.
    let ticketA1: string;
    let ticketA2: string;
    let ticketB1: string;
    let ticketNull1: string;

    const seedTicket = async (museumId: number | null, subject: string): Promise<string> => {
      const dto = await supportRepo.createTicket({
        userId: 1,
        subject,
        description: 'description ten chars min',
        museumId,
      } as CreateTicketInput);
      return dto.id;
    };

    beforeAll(async () => {
      harness = await createIntegrationHarness();
      harness.scheduleStop();
      const { createApp } = await import('@src/app');
      const tokenHelpers = await import('tests/helpers/auth/token.helpers');
      makeToken = tokenHelpers.makeToken;
      app = createApp({ healthCheck: async () => ({ database: 'up' }) });
      supportRepo = new SupportRepositoryPg(harness.dataSource);
      ticketRepo = harness.dataSource.getRepository(SupportTicket);
    });

    beforeEach(async () => {
      await harness.reset();
      // All tickets default to status 'open' (moderatable to 'resolved').
      ticketA1 = await seedTicket(MUSEUM_A, 'museum 42 ticket one');
      ticketA2 = await seedTicket(MUSEUM_A, 'museum 42 ticket two');
      ticketB1 = await seedTicket(MUSEUM_B, 'museum 99 ticket one');
      ticketNull1 = await seedTicket(null, 'global NULL-museum ticket');
    });

    // ── AC-1 LIST isolation (R2, LOAD-BEARING) ─────────────────────────────
    it('manager(42) GET /tickets → 200 with ONLY museum-42 tickets (B + NULL absent)', async () => {
      const token = makeToken({ sub: '1', role: 'museum_manager', museumId: MUSEUM_A });

      const res = await request(app)
        .get('/api/admin/tickets')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      const ids = (res.body.data as { id: string }[]).map((t) => t.id);
      // On baseline the manager is 403'd → res.body.data is undefined → FAILS.
      expect(ids).toEqual(expect.arrayContaining([ticketA1, ticketA2]));
      expect(ids).toHaveLength(2);
      expect(ids).not.toContain(ticketB1);
      expect(ids).not.toContain(ticketNull1);
      for (const row of res.body.data as { museumId: number | null }[]) {
        expect(row.museumId).toBe(MUSEUM_A);
      }
    });

    // ── AC-3 PATCH foreign-tenant → 404 + no mutation (R4, LOAD-BEARING) ───
    it('manager(42) PATCH /tickets/<museum-99 id> → 404 and the B row stays open', async () => {
      const token = makeToken({ sub: '1', role: 'museum_manager', museumId: MUSEUM_A });

      const res = await request(app)
        .patch(`/api/admin/tickets/${ticketB1}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'resolved' });

      expect(res.status).toBe(404);
      const after = await ticketRepo.findOneByOrFail({ id: ticketB1 });
      expect(after.status).toBe('open');
    });

    it('manager(42) PATCH /tickets/<NULL-museum id> → 404 and the NULL row stays open', async () => {
      const token = makeToken({ sub: '1', role: 'museum_manager', museumId: MUSEUM_A });

      const res = await request(app)
        .patch(`/api/admin/tickets/${ticketNull1}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'resolved' });

      expect(res.status).toBe(404);
      const after = await ticketRepo.findOneByOrFail({ id: ticketNull1 });
      expect(after.status).toBe('open');
    });

    // ── AC-3 PATCH own-tenant → 200 + status flips (R4 positive) ───────────
    it('manager(42) PATCH /tickets/<own museum-42 id> → 200 and the row flips to resolved', async () => {
      const token = makeToken({ sub: '1', role: 'museum_manager', museumId: MUSEUM_A });

      const res = await request(app)
        .patch(`/api/admin/tickets/${ticketA1}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'resolved' });

      expect(res.status).toBe(200);
      const after = await ticketRepo.findOneByOrFail({ id: ticketA1 });
      expect(after.status).toBe('resolved');
    });

    // ── AC-4 unscoped manager → 403 (R5) ───────────────────────────────────
    it('manager with NO museumId claim GET /tickets → 403, no data', async () => {
      const token = makeToken({ sub: '1', role: 'museum_manager' });

      const res = await request(app)
        .get('/api/admin/tickets')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body).not.toHaveProperty('data');
    });

    it('manager with NO museumId claim PATCH /tickets/<own-tenant id> → 403, row unchanged', async () => {
      const token = makeToken({ sub: '1', role: 'museum_manager' });

      const res = await request(app)
        .patch(`/api/admin/tickets/${ticketA1}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'resolved' });

      expect(res.status).toBe(403);
      const after = await ticketRepo.findOneByOrFail({ id: ticketA1 });
      expect(after.status).toBe('open');
    });

    // ── AC-5 regression: super_admin global view preserved (R6 SENTINEL) ───
    it('super_admin GET /tickets → 200 sees ALL tickets (42 + 99 + NULL)', async () => {
      const token = makeToken({ sub: '1', role: 'super_admin' });

      const res = await request(app)
        .get('/api/admin/tickets')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      const ids = (res.body.data as { id: string }[]).map((t) => t.id);
      expect(ids).toEqual(expect.arrayContaining([ticketA1, ticketA2, ticketB1, ticketNull1]));
      expect(ids).toHaveLength(4);
    });

    it('super_admin PATCH /tickets/<museum-99 id> → 200 (unscoped, cross-tenant write allowed)', async () => {
      const token = makeToken({ sub: '1', role: 'super_admin' });

      const res = await request(app)
        .patch(`/api/admin/tickets/${ticketB1}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'resolved' });

      expect(res.status).toBe(200);
      const after = await ticketRepo.findOneByOrFail({ id: ticketB1 });
      expect(after.status).toBe('resolved');
    });
  },
);
