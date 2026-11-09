import { PgMonthlyQuotaRepo } from '@shared/middleware/monthly-session-quota.repo.pg';

import type { DataSource } from 'typeorm';

function makeFakeDataSource(queryResult: unknown): {
  dataSource: DataSource;
  query: jest.Mock;
} {
  const query = jest.fn().mockResolvedValue(queryResult);
  const dataSource = { query } as unknown as DataSource;
  return { dataSource, query };
}

describe('PgMonthlyQuotaRepo.tryConsume — TypeORM UPDATE…RETURNING tuple shape [unit]', () => {
  const userId = 38;
  const limit = 3;
  const monthStart = new Date('2026-06-01T00:00:00.000Z');

  it('returns null when the UPDATE matched 0 rows (tuple [[], 0]) — quota exhausted (AC1/AC4)', async () => {
    const { dataSource } = makeFakeDataSource([[], 0]);
    const repo = new PgMonthlyQuotaRepo(dataSource);

    const result = await repo.tryConsume(userId, monthStart, limit);

    expect(result).toBeNull();
  });

  it('returns the consumed counters when the UPDATE matched 1 row (tuple [[{…}], 1]) (AC2/AC4)', async () => {
    const { dataSource } = makeFakeDataSource([
      [{ sessions_month_count: 2, sessions_month_start: '2026-06-01' }],
      1,
    ]);
    const repo = new PgMonthlyQuotaRepo(dataSource);

    const result = await repo.tryConsume(userId, monthStart, limit);

    expect(result).not.toBeNull();
    expect(result?.sessionsMonthCount).toBe(2);
    expect(result?.sessionsMonthStart).toBeInstanceOf(Date);
    expect(
      Number.isNaN((result as { sessionsMonthStart: Date }).sessionsMonthStart.getTime()),
    ).toBe(false);
  });
});
