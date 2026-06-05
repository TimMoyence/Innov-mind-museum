/**
 * C1B (RED — UFR-022 fresh-context red phase 2026-05-26).
 *
 * Value-level cross-tenant isolation proof for the admin REVIEWS surface —
 * the load-bearing artefact of slice C1B (reviews half). A `museum_manager`
 * MUST observe and moderate ONLY their own tenant's reviews, never another
 * museum's nor the global NULL-museum rows (OWASP API3:2023 / BOLA — both
 * the read side, `GET /api/admin/reviews`, and the higher-severity write
 * side, `PATCH /api/admin/reviews/:id`).
 *
 * Why integration (real PG + real HTTP, NOT mocked) :
 *   The LIST repo ALREADY filters on `review.museumId`
 *   (`review.repository.pg.ts:57-59`), but the admin facade + use-case drop
 *   the scope on the floor (`listAllReviews.useCase.ts:13-17` has no
 *   `museumId` field) → cross-tenant list. The PATCH path
 *   (`moderateReview.useCase.ts`) loads the review then moderates it with NO
 *   ownership check → a manager could mutate another tenant's moderation
 *   state by guessing the id. The RBAC matrix
 *   (`tests/unit/admin/rbac-matrix.test.ts`) MOCKS the facades, so the
 *   SQL-level scope leak + the missing write-side guard are invisible to it.
 *   A value-level real-DB assertion is the only thing that proves isolation
 *   (spec-c1b.md AC-1 / AC-3, design-c1b.md §6, UFR-022
 *   anti-mock-the-unit-under-audit).
 *
 * Pattern source (copied structure) :
 *   `tests/integration/admin/stats-tenant-isolation.test.ts` (C1A precedent) —
 *   `RUN_INTEGRATION=true` gate, `createIntegrationHarness()` +
 *   `harness.scheduleStop()` (feedback_integration_test_teardown.md), lazy
 *   import of `@src/app::createApp` + `tests/helpers/auth/token.helpers`
 *   AFTER the harness pins env (otherwise `@src/config/env` freezes
 *   `PGDATABASE` to the non-existent default), `beforeEach(harness.reset)`
 *   which seeds museums 42 (primary) + 99 (BOLA target)
 *   (integration-harness.ts:88-93).
 *
 * Test discipline (CLAUDE.md §Test Discipline) :
 *   - Shared factory ONLY — `insertReviewRow()` from
 *     `tests/helpers/review/review.fixtures.ts` (supports `museumId`,
 *     `status`; returns the generated id). No inline `as Entity`.
 *   - `makeToken({ sub, role, museumId })` mints the JWT read by
 *     `isAuthenticated` into `req.user.museumId`. No middleware mocking —
 *     the JWT IS the truth source.
 *
 * Baseline failure (tip `1dc5306d5` ancestor — reviews unchanged) :
 *   `GET`/`PATCH /api/admin/reviews` are `requireRole('admin','moderator')`
 *   → every `museum_manager` call 403s, which ≠ the asserted 200 (LIST) /
 *   404 (foreign PATCH) / 200 (own PATCH). The super_admin sentinel passes
 *   on baseline (it is the R6 regression guard, not a leak proof). FAILS.
 *
 * Frozen-test invariant (UFR-022 phase red) : this file is immutable
 * byte-for-byte once committed. A green agent that suspects a test is wrong
 * MUST emit `BLOCK-TEST-WRONG <path>:<line> <reason>` and let the dispatcher
 * re-spawn a fresh red phase.
 *
 * Lib-docs consulted : `lib-docs/typeorm/PATTERNS.md` (repo read-back),
 * `lib-docs/pg/PATTERNS.md` (§11 integration testcontainer, §3 parameterized
 * insert via the fixture), `lib-docs/express/PATTERNS.md` (§7 supertest +
 * createApp factory).
 *
 * Scoped run :
 *   cd museum-backend && RUN_INTEGRATION=true pnpm test \
 *     --testPathPattern=reviews-tenant-isolation --no-coverage --runInBand
 */
import request from 'supertest';

import { Review } from '@modules/review/domain/review/review.entity';
import { insertReviewRow } from 'tests/helpers/review/review.fixtures';
import {
  createIntegrationHarness,
  type IntegrationHarness,
} from 'tests/helpers/integration/integration-harness';

import type { Express } from 'express';
import type { Repository } from 'typeorm';

// NB: `tests/helpers/auth/token.helpers` and `@src/app` are NOT imported at
// top-level — both transitively pull `@src/config/env`, which captures
// `process.env.PGDATABASE` once at module load. The harness must run FIRST so
// it can pin `process.env.PGDATABASE` to the testcontainer's database. Mirrors
// `stats-tenant-isolation.test.ts:80-85`.
type MakeToken = (typeof import('tests/helpers/auth/token.helpers'))['makeToken'];

const shouldRunIntegration = process.env.RUN_INTEGRATION === 'true';
const describeIntegration = shouldRunIntegration ? describe : describe.skip;

const MUSEUM_A = 42; // manager's tenant (primary)
const MUSEUM_B = 99; // cross-tenant BOLA target

describeIntegration(
  'admin /reviews — museum_manager tenant isolation (C1B / OWASP API3 BOLA) [integration, real PG + HTTP]',
  () => {
    jest.setTimeout(180_000);

    let harness: IntegrationHarness;
    let app: Express;
    let reviewRepo: Repository<Review>;
    let makeToken: MakeToken;

    // Per-test seeded ids (the harness reset truncates + reseeds each test).
    let reviewA1: string;
    let reviewA2: string;
    let reviewB1: string;
    let reviewNull1: string;

    beforeAll(async () => {
      harness = await createIntegrationHarness();
      harness.scheduleStop();
      // Lazy import AFTER the harness pins env vars so createApp() and its
      // transitive @src/config/env resolve against the live testcontainer.
      const { createApp } = await import('@src/app');
      const tokenHelpers = await import('tests/helpers/auth/token.helpers');
      makeToken = tokenHelpers.makeToken;
      app = createApp({ healthCheck: async () => ({ database: 'up' }) });
      reviewRepo = harness.dataSource.getRepository(Review);
    });

    beforeEach(async () => {
      await harness.reset();
      // Seed all reviews `pending` so they are moderatable; distinct museums
      // + a NULL-museum row so an A+B(+NULL) leak is observable.
      reviewA1 = await insertReviewRow(harness.dataSource, {
        rating: 5,
        status: 'pending',
        museumId: MUSEUM_A,
        comment: 'museum A review one — sufficiently long comment.',
      });
      reviewA2 = await insertReviewRow(harness.dataSource, {
        rating: 4,
        status: 'pending',
        museumId: MUSEUM_A,
        comment: 'museum A review two — sufficiently long comment.',
      });
      reviewB1 = await insertReviewRow(harness.dataSource, {
        rating: 3,
        status: 'pending',
        museumId: MUSEUM_B,
        comment: 'museum B review one — sufficiently long comment.',
      });
      reviewNull1 = await insertReviewRow(harness.dataSource, {
        rating: 2,
        status: 'pending',
        museumId: null,
        comment: 'global NULL-museum review — sufficiently long comment.',
      });
    });

    // ── AC-1 LIST isolation (R1, LOAD-BEARING) ─────────────────────────────
    it('manager(42) GET /reviews → 200 with ONLY museum-42 reviews (B + NULL absent)', async () => {
      const token = makeToken({ sub: '1', role: 'museum_manager', museumId: MUSEUM_A });

      const res = await request(app)
        .get('/api/admin/reviews')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      const ids = (res.body.data as { id: string }[]).map((r) => r.id);
      // Only the two museum-42 reviews. On baseline the manager is 403'd
      // (admin/moderator-only), so res.body.data is undefined → throws/FAILS.
      expect(ids).toEqual(expect.arrayContaining([reviewA1, reviewA2]));
      expect(ids).toHaveLength(2);
      // Cross-tenant + global rows MUST NOT leak.
      expect(ids).not.toContain(reviewB1);
      expect(ids).not.toContain(reviewNull1);
      // Every returned row is scoped to museum 42.
      for (const row of res.body.data as { museumId: number | null }[]) {
        expect(row.museumId).toBe(MUSEUM_A);
      }
    });

    // ── AC-3 PATCH foreign-tenant → 404 + no mutation (R3, LOAD-BEARING) ───
    it('manager(42) PATCH /reviews/<museum-99 id> → 404 and the B row stays pending', async () => {
      const token = makeToken({ sub: '1', role: 'museum_manager', museumId: MUSEUM_A });

      const res = await request(app)
        .patch(`/api/admin/reviews/${reviewB1}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'approved' });

      // 404 = existence-hiding (out-of-scope id not confirmed). On baseline
      // the route 403s the manager → 403 ≠ 404, FAILS.
      expect(res.status).toBe(404);
      const after = await reviewRepo.findOneByOrFail({ id: reviewB1 });
      expect(after.status).toBe('pending');
    });

    it('manager(42) PATCH /reviews/<NULL-museum id> → 404 and the NULL row stays pending', async () => {
      const token = makeToken({ sub: '1', role: 'museum_manager', museumId: MUSEUM_A });

      const res = await request(app)
        .patch(`/api/admin/reviews/${reviewNull1}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'approved' });

      expect(res.status).toBe(404);
      const after = await reviewRepo.findOneByOrFail({ id: reviewNull1 });
      expect(after.status).toBe('pending');
    });

    // ── AC-3 PATCH own-tenant → 200 + status flips (R3 positive) ───────────
    it('manager(42) PATCH /reviews/<own museum-42 id> → 200 and the row flips to approved', async () => {
      const token = makeToken({ sub: '1', role: 'museum_manager', museumId: MUSEUM_A });

      const res = await request(app)
        .patch(`/api/admin/reviews/${reviewA1}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'approved' });

      // On baseline the route 403s the manager → 403 ≠ 200, FAILS.
      expect(res.status).toBe(200);
      const after = await reviewRepo.findOneByOrFail({ id: reviewA1 });
      expect(after.status).toBe('approved');
    });

    // ── AC-4 unscoped manager → 403 (R5) ───────────────────────────────────
    it('manager with NO museumId claim GET /reviews → 403, no data', async () => {
      const token = makeToken({ sub: '1', role: 'museum_manager' });

      const res = await request(app)
        .get('/api/admin/reviews')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body).not.toHaveProperty('data');
    });

    it('manager with NO museumId claim PATCH /reviews/<own-tenant id> → 403, row unchanged', async () => {
      const token = makeToken({ sub: '1', role: 'museum_manager' });

      const res = await request(app)
        .patch(`/api/admin/reviews/${reviewA1}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'approved' });

      expect(res.status).toBe(403);
      const after = await reviewRepo.findOneByOrFail({ id: reviewA1 });
      expect(after.status).toBe('pending');
    });

    // ── AC-5 regression: super_admin global view preserved (R6 SENTINEL) ───
    it('super_admin GET /reviews → 200 sees ALL reviews (42 + 99 + NULL)', async () => {
      const token = makeToken({ sub: '1', role: 'super_admin' });

      const res = await request(app)
        .get('/api/admin/reviews')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      const ids = (res.body.data as { id: string }[]).map((r) => r.id);
      expect(ids).toEqual(expect.arrayContaining([reviewA1, reviewA2, reviewB1, reviewNull1]));
      expect(ids).toHaveLength(4);
    });

    it('super_admin PATCH /reviews/<museum-99 id> → 200 (unscoped, cross-tenant write allowed)', async () => {
      const token = makeToken({ sub: '1', role: 'super_admin' });

      const res = await request(app)
        .patch(`/api/admin/reviews/${reviewB1}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'approved' });

      expect(res.status).toBe(200);
      const after = await reviewRepo.findOneByOrFail({ id: reviewB1 });
      expect(after.status).toBe('approved');
    });
  },
);
