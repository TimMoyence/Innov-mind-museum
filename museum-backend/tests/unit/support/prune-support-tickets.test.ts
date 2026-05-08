import { pruneSupportTickets } from '@modules/support/useCase/retention/prune-support-tickets';

import type { DataSource } from 'typeorm';

/**
 * TypeORM 0.3.x `dataSource.query()` returns `[rows, rowCount]` for DELETE/UPDATE
 * (see node_modules/typeorm/driver/postgres/PostgresQueryRunner.js raw.command switch).
 * Earlier mocks here returned a plain rows array which masked the production bug
 * where `result.length` (always 2 for the tuple) was treated as the chunk size,
 * causing an infinite loop. Every mock below now mirrors the real driver shape.
 * @param rows
 */
const tupleResult = (rows: { id: string }[]): [{ id: string }[], number] => [rows, rows.length];

describe('pruneSupportTickets', () => {
  const buildDataSource = (
    queryImpl: (sql: string, params: unknown[]) => Promise<unknown>,
  ): DataSource => ({ query: queryImpl }) as unknown as DataSource;

  it('chunks DELETE until RETURNING is empty', async () => {
    const calls: { sql: string; params: unknown[] }[] = [];
    let i = 0;
    const ds = buildDataSource(async (sql, params) => {
      calls.push({ sql, params });
      i += 1;
      if (i > 50) throw new Error(`infinite-loop guard: query called ${i} times`);
      if (i === 1) return tupleResult(Array.from({ length: 1000 }, (_, k) => ({ id: `id-${k}` })));
      if (i === 2)
        return tupleResult(Array.from({ length: 500 }, (_, k) => ({ id: `id-${k + 1000}` })));
      return tupleResult([]);
    });

    const result = await pruneSupportTickets(ds, { daysClosed: 365, batchLimit: 1000 });

    expect(result.rowsAffected).toBe(1500);
    expect(calls.length).toBe(3);
    expect(calls[0].sql).toContain('DELETE FROM "support_tickets"');
    expect(calls[0].sql).toContain("'closed', 'resolved'");
    expect(calls[0].sql).toContain('LIMIT $2');
  });

  it('passes the cutoff date and batch limit as params', async () => {
    const calls: { sql: string; params: unknown[] }[] = [];
    const ds = buildDataSource(async (sql, params) => {
      calls.push({ sql, params });
      return tupleResult([]);
    });

    await pruneSupportTickets(ds, { daysClosed: 365, batchLimit: 100 });

    const expectedCutoffMs = Date.now() - 365 * 24 * 60 * 60 * 1000;
    const passedCutoffMs = new Date(calls[0].params[0] as string).getTime();
    expect(Math.abs(expectedCutoffMs - passedCutoffMs)).toBeLessThan(2000);
    expect(calls[0].params[1]).toBe(100);
  });

  it('terminates when the driver returns the empty [rows, rowCount] tuple (regression: 2026-05-08 infinite-loop incident)', async () => {
    let i = 0;
    const ds = buildDataSource(async () => {
      i += 1;
      if (i > 5)
        throw new Error(
          `infinite-loop guard: query called ${i} times — chunk count never decreased to 0`,
        );
      return tupleResult([]);
    });

    const result = await pruneSupportTickets(ds, { daysClosed: 365, batchLimit: 1000 });

    expect(result.rowsAffected).toBe(0);
    expect(i).toBe(1);
  });
});
