import { pruneSupportTickets } from '@modules/support/useCase/retention/prune-support-tickets';

import type { DataSource } from 'typeorm';

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
      if (i === 1) return Array.from({ length: 1000 }, (_, k) => ({ id: `id-${k}` }));
      if (i === 2) return Array.from({ length: 500 }, (_, k) => ({ id: `id-${k + 1000}` }));
      return [];
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
      return [];
    });

    await pruneSupportTickets(ds, { daysClosed: 365, batchLimit: 100 });

    const expectedCutoffMs = Date.now() - 365 * 24 * 60 * 60 * 1000;
    const passedCutoffMs = new Date(calls[0].params[0] as string).getTime();
    expect(Math.abs(expectedCutoffMs - passedCutoffMs)).toBeLessThan(2000);
    expect(calls[0].params[1]).toBe(100);
  });
});
