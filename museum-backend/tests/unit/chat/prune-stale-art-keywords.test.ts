import { pruneStaleArtKeywords } from '@modules/chat/useCase/retention/prune-stale-art-keywords';

import type { DataSource } from 'typeorm';

/**
 * TypeORM 0.3.x DELETE returns `[rows, rowCount]` — see prune-support-tickets.test.ts header.
 * @param rows
 */
const tupleResult = (rows: { id: string }[]): [{ id: string }[], number] => [rows, rows.length];

describe('pruneStaleArtKeywords', () => {
  it('deletes rows with hitCount <= threshold and stale updatedAt', async () => {
    const calls: { sql: string; params: unknown[] }[] = [];
    let i = 0;
    const ds = {
      query: async (sql: string, params: unknown[]) => {
        calls.push({ sql, params });
        i += 1;
        if (i > 50) throw new Error(`infinite-loop guard: query called ${i} times`);
        if (i === 1) return tupleResult(Array.from({ length: 100 }, (_, k) => ({ id: `k-${k}` })));
        return tupleResult([]);
      },
    } as unknown as DataSource;

    const result = await pruneStaleArtKeywords(ds, { days: 90, hitThreshold: 1, batchLimit: 1000 });

    expect(result.rowsAffected).toBe(100);
    expect(calls[0].sql).toContain('DELETE FROM "art_keywords"');
    expect(calls[0].sql).toContain('"hitCount" <=');
    expect(calls[0].sql).toContain('"updatedAt" <');
    expect(calls[0].params).toContain(1);
  });

  it('terminates when the driver returns the empty [rows, rowCount] tuple (regression: 2026-05-08 infinite-loop incident)', async () => {
    let i = 0;
    const ds = {
      query: async () => {
        i += 1;
        if (i > 5)
          throw new Error(
            `infinite-loop guard: query called ${i} times — chunk count never decreased to 0`,
          );
        return [[], 0] as [unknown[], number];
      },
    } as unknown as DataSource;

    const result = await pruneStaleArtKeywords(ds, { days: 90, hitThreshold: 1, batchLimit: 1000 });

    expect(result.rowsAffected).toBe(0);
    expect(i).toBe(1);
  });
});
