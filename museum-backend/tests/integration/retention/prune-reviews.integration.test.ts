import type { Repository } from 'typeorm';

import { pruneReviews } from '@modules/review/useCase/moderation/prune-reviews';
import { Review } from '@modules/review/domain/review/review.entity';
import {
  createIntegrationHarness,
  type IntegrationHarness,
} from 'tests/helpers/integration/integration-harness';
import { makeReview } from 'tests/helpers/review/review.fixtures';

const shouldRunIntegration = process.env.RUN_INTEGRATION === 'true';
const describeIntegration = shouldRunIntegration ? describe : describe.skip;

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n: number): Date => new Date(Date.now() - n * DAY_MS);

describeIntegration('pruneReviews (real PG) [integration]', () => {
  let harness: IntegrationHarness;
  let reviewRepo: Repository<Review>;

  beforeAll(async () => {
    harness = await createIntegrationHarness();
    harness.scheduleStop();
    reviewRepo = harness.dataSource.getRepository(Review);
  });

  beforeEach(async () => {
    await harness.reset();
  });

  async function insertReview(params: {
    status: 'pending' | 'approved' | 'rejected';
    updatedAt?: Date;
    seq: number;
  }): Promise<string> {
    const fixture = makeReview({
      status: params.status,
      comment: `Review #${params.seq}`,
      userName: `User${params.seq}`,
    });
    const saved = await reviewRepo.save(
      reviewRepo.create({
        userId: fixture.userId,
        userName: fixture.userName,
        rating: fixture.rating,
        comment: fixture.comment,
        status: fixture.status,
      }),
    );
    if (params.updatedAt) {
      await harness.dataSource.query(`UPDATE "reviews" SET "updatedAt" = $1 WHERE "id" = $2`, [
        params.updatedAt.toISOString(),
        saved.id,
      ]);
    }
    return saved.id;
  }

  it('R1+R4: deletes 25 rejected stale + 25 pending stale, leaves 50 approved/recent untouched', async () => {
    for (let i = 0; i < 25; i += 1) {
      await insertReview({ status: 'rejected', updatedAt: daysAgo(45), seq: i });
    }
    for (let i = 25; i < 50; i += 1) {
      await insertReview({ status: 'pending', updatedAt: daysAgo(70), seq: i });
    }
    for (let i = 50; i < 75; i += 1) {
      await insertReview({ status: 'approved', updatedAt: daysAgo(400), seq: i });
    }
    for (let i = 75; i < 100; i += 1) {
      await insertReview({ status: 'rejected', updatedAt: daysAgo(5), seq: i });
    }

    expect(await reviewRepo.count()).toBe(100);

    const result = await pruneReviews(harness.dataSource, {
      rejectedDays: 30,
      pendingDays: 60,
      batchLimit: 100,
    });

    expect(result.rowsAffected).toBe(50);
    expect(result.details.rejected).toBe(25);
    expect(result.details.pending).toBe(25);
    expect(await reviewRepo.count()).toBe(50);
    expect(await reviewRepo.count({ where: { status: 'approved' } })).toBe(25);
    expect(await reviewRepo.count({ where: { status: 'rejected' } })).toBe(25);
    expect(await reviewRepo.count({ where: { status: 'pending' } })).toBe(0);
  });

  it('R2: rowsAffected === 0 on empty table and both passes terminate in <2s', async () => {
    expect(await reviewRepo.count()).toBe(0);

    const t0 = Date.now();
    const result = await pruneReviews(harness.dataSource, {
      rejectedDays: 30,
      pendingDays: 60,
      batchLimit: 100,
    });
    const elapsed = Date.now() - t0;

    expect(result.rowsAffected).toBe(0);
    expect(result.details.rejected).toBe(0);
    expect(result.details.pending).toBe(0);
    expect(elapsed).toBeLessThan(2000);
    expect(await reviewRepo.count()).toBe(0);
  });

  it('R3: multi-chunk dual-pass — batchLimit=10 with 30 rejected + 30 pending stale deletes all 60', async () => {
    for (let i = 0; i < 30; i += 1) {
      await insertReview({ status: 'rejected', updatedAt: daysAgo(45), seq: i });
    }
    for (let i = 30; i < 60; i += 1) {
      await insertReview({ status: 'pending', updatedAt: daysAgo(70), seq: i });
    }
    for (let i = 60; i < 70; i += 1) {
      await insertReview({ status: 'approved', updatedAt: daysAgo(400), seq: i });
    }

    expect(await reviewRepo.count()).toBe(70);

    const result = await pruneReviews(harness.dataSource, {
      rejectedDays: 30,
      pendingDays: 60,
      batchLimit: 10,
    });

    expect(result.rowsAffected).toBe(60);
    expect(result.details.rejected).toBe(30);
    expect(result.details.pending).toBe(30);
    expect(await reviewRepo.count()).toBe(10);
    expect(await reviewRepo.count({ where: { status: 'approved' } })).toBe(10);
  });
});
