/**
 * Targeted mutation kills for `pruneSupportTickets` — written 2026-05-14 to
 * eliminate 4 Stryker survivors at L69 (Array.isArray guard) and L71
 * (`chunkDeleted > 0` log gate). Strict assertions only, no production-code
 * changes. Pairs with `prune-support-tickets.test.ts` (behavioural baseline)
 * and mirrors the structure of `tests/unit/review/prune-reviews.mutants.test.ts`.
 */
import { logger } from '@shared/logger/logger';
import { pruneSupportTickets } from '@modules/support/useCase/retention/prune-support-tickets';

import type { DataSource } from 'typeorm';

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const mockedLogger = logger as jest.Mocked<typeof logger>;

interface QueryCall {
  sql: string;
  params: unknown[];
}

interface FakeDataSource {
  ds: DataSource;
  calls: QueryCall[];
}

/**
 * Builds a DataSource stub whose `query` returns the next scripted tuple per
 * call. Each entry is `[rows, rowCount]` (TypeORM 0.3.x DELETE shape) or a raw
 * override for malformed-response tests.
 * @param scripted
 */
const makeFakeDataSource = (scripted: unknown[]): FakeDataSource => {
  const calls: QueryCall[] = [];
  let i = 0;
  const ds = {
    query: async (sql: string, params: unknown[]) => {
      calls.push({ sql, params });
      const next = scripted[i] ?? [[], 0];
      i += 1;
      if (i > 50) throw new Error(`infinite-loop guard: query called ${i} times`);
      return next;
    },
  } as unknown as DataSource;
  return { ds, calls };
};

/**
 * TypeORM 0.3.x DELETE result shape.
 * @param count
 */
const tuple = (count: number): [{ id: string }[], number] => [
  Array.from({ length: count }, (_, k) => ({ id: `row-${k}` })),
  count,
];

describe('pruneSupportTickets — mutation kills', () => {
  beforeEach(() => {
    mockedLogger.info.mockClear();
    mockedLogger.warn.mockClear();
    mockedLogger.error.mockClear();
  });

  // ── L69:20 ConditionalExpression `Array.isArray(result)` → `true`
  // When the query returns a non-array (null/undefined/object), the original
  // short-circuits to 0; the mutant would index `result[1]` and either crash
  // (null/undefined) or coerce to NaN, breaking termination & rowsAffected.

  describe('non-array query response falls back to chunkDeleted = 0 (L69:20)', () => {
    it('terminates with rowsAffected = 0 when the driver returns null (kills Array.isArray → true)', async () => {
      const { ds, calls } = makeFakeDataSource([null]);

      const result = await pruneSupportTickets(ds, { daysClosed: 365, batchLimit: 1000 });

      expect(result.rowsAffected).toBe(0);
      // Single iteration: chunkDeleted = 0 → loop exits, no further query.
      expect(calls).toHaveLength(1);
      // No chunk log either (kills L71 false-positive when fallback is wrong).
      expect(mockedLogger.info).not.toHaveBeenCalled();
    });

    it('terminates with rowsAffected = 0 when the driver returns undefined', async () => {
      const { ds, calls } = makeFakeDataSource([undefined]);

      const result = await pruneSupportTickets(ds, { daysClosed: 365, batchLimit: 1000 });

      expect(result.rowsAffected).toBe(0);
      expect(calls).toHaveLength(1);
    });

    it('terminates with rowsAffected = 0 when the driver returns a non-array object', async () => {
      const { ds, calls } = makeFakeDataSource([{ rows: [], rowCount: 5 } as unknown]);

      const result = await pruneSupportTickets(ds, { daysClosed: 365, batchLimit: 1000 });

      // Mutant `Array.isArray → true` would either coerce { rows, rowCount }[1]
      // (undefined → fallback 0) or behave identically. The stricter kill is
      // ensured by the null/undefined cases above; this one defends against the
      // companion `typeof === 'number'` short-circuit.
      expect(result.rowsAffected).toBe(0);
      expect(calls).toHaveLength(1);
    });
  });

  // ── L71:9 ConditionalExpression `chunkDeleted > 0`
  //    Mutators: `true` (always log/sleep) / `false` (never log/sleep) /
  //              EqualityOperator `>=` (log on terminating zero chunk).

  describe('log gate (L71:9)', () => {
    it('NEVER logs when the very first chunk returns zero rows (kills `true` and `>= 0`)', async () => {
      const { ds, calls } = makeFakeDataSource([tuple(0)]);

      const result = await pruneSupportTickets(ds, { daysClosed: 365, batchLimit: 1000 });

      expect(result.rowsAffected).toBe(0);
      expect(calls).toHaveLength(1);
      // If the if-block was always entered (mutant `true`) OR entered on `>= 0`,
      // this terminating-zero chunk would log. Original: never.
      expect(mockedLogger.info).not.toHaveBeenCalled();
    });

    it('DOES log on a non-empty chunk with the exact event name and payload (kills `false` and ensures block content survives)', async () => {
      const { ds } = makeFakeDataSource([tuple(3), tuple(0)]);

      const result = await pruneSupportTickets(ds, { daysClosed: 365, batchLimit: 1000 });

      expect(result.rowsAffected).toBe(3);
      // Exactly ONE log call for the single non-empty chunk.
      const chunkLogs = mockedLogger.info.mock.calls.filter(
        ([event]) => event === 'prune_support_tickets_chunk',
      );
      expect(chunkLogs).toHaveLength(1);
      // Exact event name + payload — kills BlockStatement → {} and StringLiteral mutants on the log.
      expect(chunkLogs[0][0]).toBe('prune_support_tickets_chunk');
      expect(chunkLogs[0][1]).toEqual({ deleted: 3, totalSoFar: 3 });
    });

    it('logs only on positive chunks, NOT on the terminating zero chunk (kills `>= 0` and `true`)', async () => {
      // Sequence: 2 → 1 → 0. Original logs twice (after the 2-row and 1-row
      // chunks); mutants that always enter the branch would log 3 times.
      const { ds } = makeFakeDataSource([tuple(2), tuple(1), tuple(0)]);

      const result = await pruneSupportTickets(ds, { daysClosed: 365, batchLimit: 1000 });

      expect(result.rowsAffected).toBe(3);
      const chunkLogs = mockedLogger.info.mock.calls.filter(
        ([event]) => event === 'prune_support_tickets_chunk',
      );
      expect(chunkLogs).toHaveLength(2);
      expect(chunkLogs[0][1]).toEqual({ deleted: 2, totalSoFar: 2 });
      expect(chunkLogs[1][1]).toEqual({ deleted: 1, totalSoFar: 3 });
    });
  });

  // ── Defence: throttle pause is enforced only on non-empty chunks ──
  // Confirms the `if (chunkDeleted > 0)` block body actually runs the sleep.

  it('sleeps (~50ms) after a non-empty chunk and skips sleep on the empty terminator', async () => {
    // 1 row then 0: total wall time must exceed the throttle (~50ms) once.
    const { ds } = makeFakeDataSource([tuple(1), tuple(0)]);

    const start = performance.now();
    await pruneSupportTickets(ds, { daysClosed: 365, batchLimit: 1000 });
    const elapsed = performance.now() - start;

    // Single throttle pause of ~50ms — be lenient on CI but block 0ms (no-pause) mutants.
    expect(elapsed).toBeGreaterThanOrEqual(40);
    // Sanity: only one positive chunk → exactly one chunk log.
    const chunkLogs = mockedLogger.info.mock.calls.filter(
      ([event]) => event === 'prune_support_tickets_chunk',
    );
    expect(chunkLogs).toHaveLength(1);
  });
});
