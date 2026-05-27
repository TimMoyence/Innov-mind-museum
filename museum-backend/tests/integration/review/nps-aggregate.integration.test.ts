/**
 * T-AGG-2 (RED — S-BE-AGG, UFR-022 fresh-context red phase 2026-05-26).
 *
 * Executes `ReviewRepositoryPg.aggregateNps(...)` against a REAL Postgres
 * testcontainer with every migration applied. This is the slice's core: today
 * `aggregateNps` has ZERO callers (`review.repository.pg.ts:88-107` is never
 * exercised end-to-end), so the SQL has never actually run. These cases prove
 * the band classification + global-incl-NULL semantics (R6-R12).
 *
 * Baseline FAILS because:
 *   - the signature requires `museumId` (`review.repository.interface.ts:42`) →
 *     `aggregateNps()` / `aggregateNps(null)` are not valid global calls, the
 *     SQL hard-codes `WHERE r.museumId = :museumId` so a global aggregate that
 *     INCLUDES `museum_id IS NULL` rows does not exist. The global cases here
 *     count 0 (or NaN-guarded 0) instead of the seeded totals → assertion-fail.
 *
 * Harness contract (CLAUDE.md gotcha `feedback_integration_test_teardown`):
 *   - `createIntegrationHarness()` + `harness.scheduleStop()` (NOT `stop()`).
 *   - `harness.reset()` per-test TRUNCATEs domain tables + seeds museums 42/99.
 *   - run via `RUN_INTEGRATION=true pnpm test -- --runInBand`.
 *
 * lib-docs/typeorm/PATTERNS.md §8 (testing) + §3.5 (QueryBuilder), lib-docs/pg
 * LESSONS "pg returns COUNT as strings" (the repo parses via Number.parseInt).
 * Test data via `insertReviewRow` shared factory (no inline `as Review`).
 */
import { ReviewRepositoryPg } from '@modules/review/adapters/secondary/pg/review.repository.pg';
import {
  createIntegrationHarness,
  type IntegrationHarness,
} from 'tests/helpers/integration/integration-harness';
import { insertReviewRow } from 'tests/helpers/review/review.fixtures';

describe('ReviewRepositoryPg.aggregateNps — real SQL [integration, real PG]', () => {
  jest.setTimeout(300_000);

  let harness: IntegrationHarness;
  let repo: ReviewRepositoryPg;

  beforeAll(async () => {
    harness = await createIntegrationHarness();
    harness.scheduleStop();
    repo = new ReviewRepositoryPg(harness.dataSource);
  });

  beforeEach(async () => {
    await harness.reset();
  });

  describe('empty scope (R9 — count = 0)', () => {
    it('returns neutral aggregate when no approved reviews exist', async () => {
      const result = await repo.aggregateNps();
      expect(result).toEqual({ nps: 0, promoters: 0, passives: 0, detractors: 0, count: 0 });
    });
  });

  describe('all-promoter / all-detractor extremes (R10)', () => {
    it('returns nps +100 and promoters 4 when all four reviews are rating 10', async () => {
      for (let i = 0; i < 4; i += 1) {
        await insertReviewRow(harness.dataSource, { rating: 10, museumId: 42 });
      }

      const result = await repo.aggregateNps(42);

      expect(result.count).toBe(4);
      expect(result.promoters).toBe(4);
      expect(result.detractors).toBe(0);
      expect(result.nps).toBe(100);
    });

    it('returns nps -100 and detractors 4 when all four reviews are rating 0', async () => {
      for (let i = 0; i < 4; i += 1) {
        await insertReviewRow(harness.dataSource, { rating: 0, museumId: 42 });
      }

      const result = await repo.aggregateNps(42);

      expect(result.count).toBe(4);
      expect(result.detractors).toBe(4);
      expect(result.promoters).toBe(0);
      expect(result.nps).toBe(-100);
    });
  });

  describe('band boundaries (R8 — 6 detractor / 7,8 passive / 9 promoter)', () => {
    it('classifies rating 6 as detractor, 7 and 8 as passive, 9 as promoter', async () => {
      await insertReviewRow(harness.dataSource, { rating: 6, museumId: 42 });
      await insertReviewRow(harness.dataSource, { rating: 7, museumId: 42 });
      await insertReviewRow(harness.dataSource, { rating: 8, museumId: 42 });
      await insertReviewRow(harness.dataSource, { rating: 9, museumId: 42 });

      const result = await repo.aggregateNps(42);

      expect(result.count).toBe(4);
      expect(result.detractors).toBe(1); // 6
      expect(result.passives).toBe(2); // 7, 8
      expect(result.promoters).toBe(1); // 9
      // (1 promoter - 1 detractor) / 4 * 100 = 0
      expect(result.nps).toBe(0);
    });
  });

  describe('fractional rounding (R11 — round(33.33) = 33)', () => {
    it('rounds (1 promoter + 2 passives) / 3 to nps 33', async () => {
      await insertReviewRow(harness.dataSource, { rating: 9, museumId: 42 }); // promoter
      await insertReviewRow(harness.dataSource, { rating: 7, museumId: 42 }); // passive
      await insertReviewRow(harness.dataSource, { rating: 8, museumId: 42 }); // passive

      const result = await repo.aggregateNps(42);

      expect(result.count).toBe(3);
      expect(result.promoters).toBe(1);
      expect(result.passives).toBe(2);
      expect(result.detractors).toBe(0);
      // round((1 - 0) / 3 * 100) = round(33.33) = 33
      expect(result.nps).toBe(33);
    });
  });

  describe('passives-only (R11 — nps 0, passives counted)', () => {
    it('returns nps 0 and passives N when only 7-8 ratings exist', async () => {
      await insertReviewRow(harness.dataSource, { rating: 7, museumId: 42 });
      await insertReviewRow(harness.dataSource, { rating: 8, museumId: 42 });
      await insertReviewRow(harness.dataSource, { rating: 7, museumId: 42 });

      const result = await repo.aggregateNps(42);

      expect(result.count).toBe(3);
      expect(result.passives).toBe(3);
      expect(result.promoters).toBe(0);
      expect(result.detractors).toBe(0);
      expect(result.nps).toBe(0);
    });
  });

  describe('legacy 1-5 cohabitation (R12 — rating 5 scored as detractor)', () => {
    it('scores a legacy rating 5 as a detractor alongside a 0-10 rating 9', async () => {
      await insertReviewRow(harness.dataSource, { rating: 5, museumId: 42 }); // legacy → detractor (≤6)
      await insertReviewRow(harness.dataSource, { rating: 9, museumId: 42 }); // promoter

      const result = await repo.aggregateNps(42);

      expect(result.count).toBe(2);
      expect(result.detractors).toBe(1); // the legacy 5
      expect(result.promoters).toBe(1); // the 9
      // (1 - 1) / 2 * 100 = 0
      expect(result.nps).toBe(0);
    });
  });

  describe('only approved reviews are aggregated (R6/R7 scope = approved)', () => {
    it('excludes pending and rejected reviews from the aggregate', async () => {
      await insertReviewRow(harness.dataSource, { rating: 10, museumId: 42, status: 'approved' });
      await insertReviewRow(harness.dataSource, { rating: 0, museumId: 42, status: 'pending' });
      await insertReviewRow(harness.dataSource, { rating: 0, museumId: 42, status: 'rejected' });

      const result = await repo.aggregateNps(42);

      expect(result.count).toBe(1);
      expect(result.promoters).toBe(1);
      expect(result.nps).toBe(100);
    });
  });

  describe('NPS scale-epoch cutoff — legacy pre-epoch reviews excluded (F3)', () => {
    // The 1-5 → 0-10 scale switch means a legacy "5" is now scored as a
    // detractor (≤6) although it was a top legacy rating. `aggregateNps` MUST
    // only count reviews created AT/AFTER `NPS_SCALE_EPOCH` (default
    // 2026-05-27T00:00:00Z) so the legacy cohort never poisons the score.
    // Baseline FAILS: current impl has no `createdAt >= :npsEpoch` predicate,
    // so the legacy rows are counted alongside the post-epoch ones.
    const BEFORE_EPOCH = '2026-01-01T00:00:00Z';
    const AFTER_EPOCH = '2026-06-01T00:00:00Z';

    it('global aggregate counts ONLY the post-epoch review, excluding a legacy pre-epoch one', async () => {
      // Legacy detractor-by-coincidence (a former 1-5 "5") created before epoch.
      await insertReviewRow(harness.dataSource, {
        rating: 5,
        museumId: null,
        createdAt: BEFORE_EPOCH,
      });
      // Genuine post-epoch promoter on the new 0-10 scale.
      await insertReviewRow(harness.dataSource, {
        rating: 10,
        museumId: null,
        createdAt: AFTER_EPOCH,
      });

      const result = await repo.aggregateNps();

      // Only the post-epoch 10 is counted: the legacy 5 must NOT appear in any
      // bucket nor the total.
      expect(result.count).toBe(1);
      expect(result.promoters).toBe(1);
      expect(result.detractors).toBe(0);
      expect(result.nps).toBe(100);
    });

    it('per-museum aggregate counts ONLY the post-epoch review, excluding a legacy pre-epoch one', async () => {
      await insertReviewRow(harness.dataSource, {
        rating: 5,
        museumId: 42,
        createdAt: BEFORE_EPOCH,
      });
      await insertReviewRow(harness.dataSource, {
        rating: 10,
        museumId: 42,
        createdAt: AFTER_EPOCH,
      });

      const result = await repo.aggregateNps(42);

      expect(result.count).toBe(1);
      expect(result.promoters).toBe(1);
      expect(result.detractors).toBe(0);
      expect(result.nps).toBe(100);
    });

    it('returns a neutral aggregate when the only review is legacy (pre-epoch)', async () => {
      await insertReviewRow(harness.dataSource, {
        rating: 5,
        museumId: null,
        createdAt: BEFORE_EPOCH,
      });

      const result = await repo.aggregateNps();

      expect(result).toEqual({ nps: 0, promoters: 0, passives: 0, detractors: 0, count: 0 });
    });
  });

  describe('global vs per-museum incl. museum_id NULL (R7 / R2 — the key fix)', () => {
    beforeEach(async () => {
      // 5 global (museum_id NULL) + 5 attributed to museum 42, all approved.
      for (let i = 0; i < 5; i += 1) {
        await insertReviewRow(harness.dataSource, { rating: 10, museumId: null });
      }
      for (let i = 0; i < 5; i += 1) {
        await insertReviewRow(harness.dataSource, { rating: 10, museumId: 42 });
      }
    });

    it('global aggregate (no museumId) counts ALL 10 reviews, including museum_id NULL', async () => {
      const result = await repo.aggregateNps();
      expect(result.count).toBe(10);
      expect(result.promoters).toBe(10);
    });

    it('global aggregate with explicit null counts ALL 10 reviews', async () => {
      const result = await repo.aggregateNps(null);
      expect(result.count).toBe(10);
    });

    it('per-museum aggregate (museum 42) counts ONLY the 5 attributed reviews, NOT the NULL ones', async () => {
      const result = await repo.aggregateNps(42);
      expect(result.count).toBe(5);
    });

    it('per-museum aggregate for a museum with no reviews (99) returns neutral 0', async () => {
      const result = await repo.aggregateNps(99);
      expect(result).toEqual({ nps: 0, promoters: 0, passives: 0, detractors: 0, count: 0 });
    });
  });
});
