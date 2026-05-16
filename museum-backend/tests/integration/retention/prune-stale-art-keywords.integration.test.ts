/**
 * TD-4 — real-PG integration test for `pruneStaleArtKeywords`.
 *
 * Pins the driver-tuple contract against a real Postgres testcontainer so the
 * incident-2026-05-08 busy-loop class of bugs cannot reach prod again.
 * See `museum-backend/src/modules/chat/useCase/prune-stale-art-keywords.ts`
 * and ADR-020.
 *
 * Run with:
 *   RUN_INTEGRATION=true pnpm test:integration -- \
 *     --testPathPattern=tests/integration/retention/prune-stale-art-keywords
 */
import type { Repository } from 'typeorm';

import { pruneStaleArtKeywords } from '@modules/chat/useCase/prune-stale-art-keywords';
import { ArtKeyword } from '@modules/chat/domain/art-keyword/artKeyword.entity';
import {
  createIntegrationHarness,
  type IntegrationHarness,
} from 'tests/helpers/integration/integration-harness';
import { makeArtKeyword } from 'tests/helpers/chat/artKeyword.fixtures';

const shouldRunIntegration = process.env.RUN_INTEGRATION === 'true';
const describeIntegration = shouldRunIntegration ? describe : describe.skip;

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n: number): Date => new Date(Date.now() - n * DAY_MS);

describeIntegration('pruneStaleArtKeywords (real PG) [integration]', () => {
  jest.setTimeout(180_000);

  let harness: IntegrationHarness;
  let keywordRepo: Repository<ArtKeyword>;

  beforeAll(async () => {
    harness = await createIntegrationHarness();
    harness.scheduleStop();
    keywordRepo = harness.dataSource.getRepository(ArtKeyword);
  });

  beforeEach(async () => {
    await harness.reset();
  });

  /**
   * Insert a single ArtKeyword and (optionally) force its `updatedAt` to a
   * past timestamp. `(keyword, locale)` is UNIQUE — caller MUST supply a
   * unique `keyword` per insert in the same test.
   * @param params
   * @param params.keyword
   * @param params.hitCount
   * @param params.locale
   * @param params.updatedAt
   */
  async function insertKeyword(params: {
    keyword: string;
    hitCount: number;
    locale?: string;
    updatedAt?: Date;
  }): Promise<string> {
    const fixture = makeArtKeyword({
      keyword: params.keyword,
      locale: params.locale ?? 'en',
      hitCount: params.hitCount,
    });
    const saved = await keywordRepo.save(
      keywordRepo.create({
        keyword: fixture.keyword,
        locale: fixture.locale,
        category: fixture.category,
        hitCount: fixture.hitCount,
      }),
    );
    if (params.updatedAt) {
      await harness.dataSource.query(`UPDATE "art_keywords" SET "updatedAt" = $1 WHERE "id" = $2`, [
        params.updatedAt.toISOString(),
        saved.id,
      ]);
    }
    return saved.id;
  }

  it('R1+R4: deletes 50 stale low-hit keywords, leaves 50 active or recent untouched', async () => {
    // 25 stale hitCount=1
    for (let i = 0; i < 25; i += 1) {
      await insertKeyword({
        keyword: `stale-low-${i}`,
        hitCount: 1,
        updatedAt: daysAgo(120),
      });
    }
    // 25 stale hitCount=0
    for (let i = 0; i < 25; i += 1) {
      await insertKeyword({
        keyword: `stale-zero-${i}`,
        hitCount: 0,
        updatedAt: daysAgo(120),
      });
    }
    // 25 stale but high-hit (NOT eligible)
    for (let i = 0; i < 25; i += 1) {
      await insertKeyword({
        keyword: `popular-${i}`,
        hitCount: 5,
        updatedAt: daysAgo(120),
      });
    }
    // 25 recent low-hit (NOT eligible — updatedAt too recent)
    for (let i = 0; i < 25; i += 1) {
      await insertKeyword({
        keyword: `recent-${i}`,
        hitCount: 1,
        updatedAt: daysAgo(5),
      });
    }

    expect(await keywordRepo.count()).toBe(100);

    const result = await pruneStaleArtKeywords(harness.dataSource, {
      days: 90,
      hitThreshold: 1,
      batchLimit: 100,
    });

    expect(result.rowsAffected).toBe(50);
    expect(await keywordRepo.count()).toBe(50);
    // Survivors: 25 popular (hitCount>1) + 25 recent (updatedAt within 90d)
    const survivors = await keywordRepo.find();
    expect(survivors.filter((k) => k.hitCount > 1)).toHaveLength(25);
    expect(survivors.filter((k) => k.hitCount <= 1)).toHaveLength(25);
  });

  it('R2: rowsAffected === 0 on empty table and terminates in <1s', async () => {
    expect(await keywordRepo.count()).toBe(0);

    const t0 = Date.now();
    const result = await pruneStaleArtKeywords(harness.dataSource, {
      days: 90,
      hitThreshold: 1,
      batchLimit: 100,
    });
    const elapsed = Date.now() - t0;

    expect(result.rowsAffected).toBe(0);
    expect(elapsed).toBeLessThan(1000);
    expect(await keywordRepo.count()).toBe(0);
  });

  it('R3: multi-chunk — batchLimit=20 with 50 eligible rows deletes all 50 across chunks', async () => {
    for (let i = 0; i < 50; i += 1) {
      await insertKeyword({
        keyword: `chunk-stale-${i}`,
        hitCount: 1,
        updatedAt: daysAgo(120),
      });
    }
    // 10 non-eligible sentinels (popular)
    for (let i = 0; i < 10; i += 1) {
      await insertKeyword({
        keyword: `chunk-popular-${i}`,
        hitCount: 10,
        updatedAt: daysAgo(120),
      });
    }

    expect(await keywordRepo.count()).toBe(60);

    const result = await pruneStaleArtKeywords(harness.dataSource, {
      days: 90,
      hitThreshold: 1,
      batchLimit: 20,
    });

    expect(result.rowsAffected).toBe(50);
    expect(await keywordRepo.count()).toBe(10);
    const survivors = await keywordRepo.find();
    expect(survivors.every((k) => k.hitCount === 10)).toBe(true);
  });
});
