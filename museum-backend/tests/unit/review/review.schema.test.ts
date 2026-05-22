/**
 * T-B3 (RED — Wave B / C7 — UFR-022 fresh-context red phase 2026-05-21).
 *
 * Pins the future widened range for `createReviewSchema.rating` :
 *   1-5 (current, smallint star-rating) → 0-10 (NPS Net Promoter Score scale).
 *
 * The widening is REQ R-C7b in `team-state/2026-05-21-p0-feature-gates/spec.md`:
 *   "When a review is created/read/aggregated, the system MUST scope by museum_id,
 *    and the rating MUST accept the NPS scale 0-10 (instead of 1-5)."
 *
 * Baseline (HEAD `89d2d7b44`) — `museum-backend/src/modules/review/adapters/primary/http/schemas/review.schemas.ts:4`
 *   `rating: z.number().int().min(1).max(5)`
 * ⇒ rating 0 and rating 10 are rejected ⇒ tests below FAIL. This is the
 * success criterion of the red phase per UFR-022.
 *
 * Scope of THIS file (deliberately narrow — matches brief T-B3):
 *   - (a) accept `rating: 0`           (new NPS detractor floor)
 *   - (b) reject `rating: 11`          (above NPS ceiling — still a guard)
 *   - (c) accept `rating: 5`           (back-compat: existing 1-5 reviews
 *                                       stay valid; cohabitation per D8 / Q-C7)
 *   - (d) accept `rating: 10`          (new NPS promoter ceiling)
 *
 * Scope explicitly OUT (covered by integration tests, not here):
 *   - Persistence with museum_id (covered by T-B4 ticket scope test for the
 *     equivalent shape; reviews-side persistence will land alongside T-B7
 *     entity changes in green).
 *   - smallint column widening (the existing CHECK constraint
 *     `rating >= 1 AND rating <= 5` in
 *     `museum-backend/src/data/db/migrations/1774543500000-CreateReviewsTable.ts:16`
 *     must be widened in green by a follow-up migration — surfaced here as
 *     context, not asserted by this unit test).
 *
 * No factories used (the Zod schema is a pure value object — the test
 * discipline ESLint rule applies to entity creation, not to schema input
 * payloads, mirroring `tests/unit/admin/admin-schemas.test.ts`).
 */
import { createReviewSchema } from '@modules/review/adapters/primary/http/schemas/review.schemas';

describe('createReviewSchema — rating range (T-B3 — R-C7b NPS 0-10)', () => {
  // Shared valid `comment` payload — schema requires min(10) chars. Lifted
  // out so each `it` block reads as one assertion about `rating` alone.
  const validComment = 'This is a sufficiently long comment to satisfy z.string().min(10).';

  describe('accepts NPS endpoints + back-compat', () => {
    it('accepts rating: 0 (NPS detractor floor — currently min(1) → fails baseline)', () => {
      const result = createReviewSchema.safeParse({ rating: 0, comment: validComment });
      // FAIL at baseline: Zod min(1) rejects 0 with "Too small".
      expect(result.success).toBe(true);
    });

    it('accepts rating: 5 (back-compat: existing 1-5 ratings remain valid — D8 / Q-C7)', () => {
      // Sanity / regression guard — once green widens to 0-10, midpoint
      // MUST still be accepted (no break for the 1-5 corpus already in DB).
      const result = createReviewSchema.safeParse({ rating: 5, comment: validComment });
      expect(result.success).toBe(true);
    });

    it('accepts rating: 10 (NPS promoter ceiling — currently max(5) → fails baseline)', () => {
      const result = createReviewSchema.safeParse({ rating: 10, comment: validComment });
      // FAIL at baseline: Zod max(5) rejects 10 with "Too big".
      expect(result.success).toBe(true);
    });
  });

  describe('rejects out-of-range values (guard still holds)', () => {
    it('rejects rating: 11 (above NPS ceiling — guard against unbounded scoring)', () => {
      const result = createReviewSchema.safeParse({ rating: 11, comment: validComment });
      // Currently fails because max(5) — but green MUST keep 11 rejected
      // (max(10)) so this assertion both fails at baseline AND survives
      // green (regression guard).
      expect(result.success).toBe(false);
    });

    it('rejects rating: -1 (below NPS floor — symmetry guard)', () => {
      const result = createReviewSchema.safeParse({ rating: -1, comment: validComment });
      expect(result.success).toBe(false);
    });
  });
});
