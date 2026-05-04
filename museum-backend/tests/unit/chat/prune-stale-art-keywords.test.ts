import { pruneStaleArtKeywords } from '@modules/chat/useCase/retention/prune-stale-art-keywords';

import type { DataSource } from 'typeorm';

describe('pruneStaleArtKeywords', () => {
  it('deletes rows with hitCount <= threshold and stale updatedAt', async () => {
    const calls: { sql: string; params: unknown[] }[] = [];
    let i = 0;
    const ds = {
      query: async (sql: string, params: unknown[]) => {
        calls.push({ sql, params });
        i += 1;
        if (i === 1) return Array.from({ length: 100 }, (_, k) => ({ id: `k-${k}` }));
        return [];
      },
    } as unknown as DataSource;

    const result = await pruneStaleArtKeywords(ds, { days: 90, hitThreshold: 1, batchLimit: 1000 });

    expect(result.rowsAffected).toBe(100);
    expect(calls[0].sql).toContain('DELETE FROM "art_keywords"');
    expect(calls[0].sql).toContain('"hitCount" <=');
    expect(calls[0].sql).toContain('"updatedAt" <');
    expect(calls[0].params).toContain(1);
  });
});
