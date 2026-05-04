import { pruneReviews } from '@modules/review/useCase/moderation/prune-reviews';

import type { DataSource } from 'typeorm';

describe('pruneReviews', () => {
  it('runs two DELETE passes (rejected + pending) and aggregates counts', async () => {
    const calls: string[] = [];
    let i = 0;
    const ds = {
      query: async (sql: string) => {
        calls.push(sql);
        i += 1;
        if (i === 1) return Array.from({ length: 200 }, (_, k) => ({ id: `r-${k}` }));
        if (i === 2) return [];
        if (i === 3) return Array.from({ length: 50 }, (_, k) => ({ id: `p-${k}` }));
        return [];
      },
    } as unknown as DataSource;

    const result = await pruneReviews(ds, {
      rejectedDays: 30,
      pendingDays: 60,
      batchLimit: 1000,
    });

    expect(result.rowsAffected).toBe(250);
    expect(calls.some((sql) => sql.includes("'rejected'"))).toBe(true);
    expect(calls.some((sql) => sql.includes("'pending'"))).toBe(true);
    expect(result.details.rejected).toBe(200);
    expect(result.details.pending).toBe(50);
  });
});
