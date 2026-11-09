import { createReviewSchema } from '@modules/review/adapters/primary/http/schemas/review.schemas';

describe('createReviewSchema — rating range (T-B3 — R-C7b NPS 0-10)', () => {
  const validComment = 'This is a sufficiently long comment to satisfy z.string().min(10).';

  describe('accepts NPS endpoints + back-compat', () => {
    it('accepts rating: 0 (NPS detractor floor — currently min(1) → fails baseline)', () => {
      const result = createReviewSchema.safeParse({ rating: 0, comment: validComment });
      expect(result.success).toBe(true);
    });

    it('accepts rating: 5 (back-compat: existing 1-5 ratings remain valid — D8 / Q-C7)', () => {
      const result = createReviewSchema.safeParse({ rating: 5, comment: validComment });
      expect(result.success).toBe(true);
    });

    it('accepts rating: 10 (NPS promoter ceiling — currently max(5) → fails baseline)', () => {
      const result = createReviewSchema.safeParse({ rating: 10, comment: validComment });
      expect(result.success).toBe(true);
    });
  });

  describe('rejects out-of-range values (guard still holds)', () => {
    it('rejects rating: 11 (above NPS ceiling — guard against unbounded scoring)', () => {
      const result = createReviewSchema.safeParse({ rating: 11, comment: validComment });
      expect(result.success).toBe(false);
    });

    it('rejects rating: -1 (below NPS floor — symmetry guard)', () => {
      const result = createReviewSchema.safeParse({ rating: -1, comment: validComment });
      expect(result.success).toBe(false);
    });
  });
});
