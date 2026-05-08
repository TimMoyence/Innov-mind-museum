import { pruneReviews } from '@modules/review/useCase/moderation/prune-reviews';

import type { DataSource } from 'typeorm';

/**
 * TypeORM 0.3.x DELETE returns `[rows, rowCount]` — see prune-support-tickets.test.ts header.
 * @param rows
 */
const tupleResult = (rows: { id: string }[]): [{ id: string }[], number] => [rows, rows.length];

describe('pruneReviews', () => {
  it('runs two DELETE passes (rejected + pending) and aggregates counts', async () => {
    const calls: string[] = [];
    let i = 0;
    const ds = {
      query: async (sql: string) => {
        calls.push(sql);
        i += 1;
        if (i > 50) throw new Error(`infinite-loop guard: query called ${i} times`);
        if (i === 1) return tupleResult(Array.from({ length: 200 }, (_, k) => ({ id: `r-${k}` })));
        if (i === 2) return tupleResult([]);
        if (i === 3) return tupleResult(Array.from({ length: 50 }, (_, k) => ({ id: `p-${k}` })));
        return tupleResult([]);
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

  it('terminates both passes when the driver returns the empty [rows, rowCount] tuple (regression: 2026-05-08 infinite-loop incident)', async () => {
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

    const result = await pruneReviews(ds, {
      rejectedDays: 30,
      pendingDays: 60,
      batchLimit: 1000,
    });

    expect(result.rowsAffected).toBe(0);
    expect(i).toBe(2); // one pass for rejected, one for pending
  });
});
