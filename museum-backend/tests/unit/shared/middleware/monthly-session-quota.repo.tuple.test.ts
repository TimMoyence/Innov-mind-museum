/**
 * T1.1 (RED — UFR-022 fresh-context red phase, run 2026-06-01-quota-tuple-402).
 *
 * Proves the TypeORM `UPDATE … RETURNING` tuple-shape bug in
 * `PgMonthlyQuotaRepo.tryConsume`
 * (`src/shared/middleware/monthly-session-quota.repo.pg.ts:39-64`).
 *
 * Root cause (discovery.md, confirmed runtime + lib-docs/typeorm/LESSONS.md
 * 2026-05-08 + PATTERNS.md §4.10): `dataSource.query("UPDATE … RETURNING …")`
 * returns the tuple `[rows[], affectedCount]` on Postgres (TypeORM 0.3.28), NOT
 * a flat `rows[]`. The current code reads `result.length === 0` (always 2) and
 * `result[0]` as a row (it is the rows ARRAY). Consequences captured live:
 *   - quota exhausted (0 rows updated): `result = [[], 0]` → `length === 2`
 *     (never 0) → `result[0] = []` treated as a row → `sessions_month_count`
 *     undefined, `new Date(undefined)` = Invalid Date → a TRUTHY object returned
 *     → middleware lets the request through → 201 instead of 402.
 *   - one row: `result = [[{…}], 1]` → `result[0]` is the rows array, not the row.
 *
 * This RED replays those EXACT runtime tuple shapes through a fake DataSource so
 * the bug fails the standard `pnpm test` gate WITHOUT needing a real DB (the
 * companion integration suite proves fidelity against real pg).
 *
 * Why this matters (UFR-017): the existing middleware test MOCKS `tryConsume`,
 * so it could never catch this — it was green on the buggy code. This test
 * exercises the adapter's real parsing of the driver return shape.
 *
 * RED expectation on the CURRENT (buggy) code:
 *   - `[[], 0]` case: `tryConsume` returns a truthy object (count=undefined,
 *     Invalid Date) instead of `null` → `expect(...).toBeNull()` FAILS → exit ≠ 0.
 *
 * Maps: AC1 (limit → null), AC2 (consume → valid Date), AC4 (real return shape).
 *
 * Test discipline (CLAUDE.md): the `User` entity is NOT touched here (the fake
 * DataSource never resolves a repository), so no factory/entity is needed. The
 * `as unknown as DataSource` cast is the test-local stub seam permitted in tests.
 */
import { PgMonthlyQuotaRepo } from '@shared/middleware/monthly-session-quota.repo.pg';

import type { DataSource } from 'typeorm';

/**
 * Builds a fake DataSource whose `.query()` resolves to the EXACT tuple shape
 * TypeORM 0.3.28 returns for an `UPDATE … RETURNING` on Postgres.
 * @param queryResult The value `.query()` resolves to (the runtime tuple shape).
 * @returns The fake `DataSource` plus the underlying jest mock for assertions.
 */
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
    // Runtime-captured shape when the WHERE refused (count = limit, same month).
    const { dataSource } = makeFakeDataSource([[], 0]);
    const repo = new PgMonthlyQuotaRepo(dataSource);

    const result = await repo.tryConsume(userId, monthStart, limit);

    // BUG: current code reads result[0] = [] as a row → truthy object → NOT null.
    expect(result).toBeNull();
  });

  it('returns the consumed counters when the UPDATE matched 1 row (tuple [[{…}], 1]) (AC2/AC4)', async () => {
    // Runtime-captured shape when a row was updated (count incremented to 2).
    const { dataSource } = makeFakeDataSource([
      [{ sessions_month_count: 2, sessions_month_start: '2026-06-01' }],
      1,
    ]);
    const repo = new PgMonthlyQuotaRepo(dataSource);

    const result = await repo.tryConsume(userId, monthStart, limit);

    expect(result).not.toBeNull();
    expect(result?.sessionsMonthCount).toBe(2);
    // sessionsMonthStart MUST be a valid Date (the buggy path produced Invalid Date).
    expect(result?.sessionsMonthStart).toBeInstanceOf(Date);
    expect(
      Number.isNaN((result as { sessionsMonthStart: Date }).sessionsMonthStart.getTime()),
    ).toBe(false);
  });
});
