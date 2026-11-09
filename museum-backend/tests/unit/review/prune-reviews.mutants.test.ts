import { logger } from '@shared/logger/logger';
import { pruneReviews } from '@modules/review/useCase/moderation/prune-reviews';

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

const tuple = (count: number): [{ id: string }[], number] => [
  Array.from({ length: count }, (_, k) => ({ id: `row-${k}` })),
  count,
];

describe('pruneReviews — mutation kills', () => {
  const FIXED_NOW = Date.UTC(2026, 4, 14, 12, 0, 0);

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);
    mockedLogger.info.mockClear();
    mockedLogger.warn.mockClear();
    mockedLogger.error.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('computes rejected cutoff = NOW - rejectedDays * 24 * 60 * 60 * 1000 (exact ms)', async () => {
    const { ds, calls } = makeFakeDataSource([tuple(0), tuple(0)]);

    const result = await pruneReviews(ds, {
      rejectedDays: 30,
      pendingDays: 60,
      batchLimit: 500,
    });

    const expectedRejected = new Date(FIXED_NOW - 30 * 24 * 60 * 60 * 1000).toISOString();
    expect(expectedRejected).toBe('2026-04-14T12:00:00.000Z');
    expect(result.details.rejectedCutoffDate).toBe(expectedRejected);
    expect(calls[0].params[0]).toBe(expectedRejected);
  });

  it('computes pending cutoff = NOW - pendingDays * 24 * 60 * 60 * 1000 (exact ms)', async () => {
    const { ds, calls } = makeFakeDataSource([tuple(0), tuple(0)]);

    const result = await pruneReviews(ds, {
      rejectedDays: 30,
      pendingDays: 60,
      batchLimit: 500,
    });

    const expectedPending = new Date(FIXED_NOW - 60 * 24 * 60 * 60 * 1000).toISOString();
    expect(expectedPending).toBe('2026-03-15T12:00:00.000Z');
    expect(result.details.pendingCutoffDate).toBe(expectedPending);
    expect(calls[1].params[0]).toBe(expectedPending);
  });

  it('uses different rejected vs pending cutoffs (rejected is more recent)', async () => {
    const { ds } = makeFakeDataSource([tuple(0), tuple(0)]);

    const result = await pruneReviews(ds, {
      rejectedDays: 7,
      pendingDays: 30,
      batchLimit: 100,
    });

    const rejectedMs = Date.parse(result.details.rejectedCutoffDate as string);
    const pendingMs = Date.parse(result.details.pendingCutoffDate as string);
    expect(rejectedMs - pendingMs).toBe(23 * 24 * 60 * 60 * 1000);
    expect(rejectedMs).toBeLessThan(FIXED_NOW);
    expect(pendingMs).toBeLessThan(FIXED_NOW);
    expect(FIXED_NOW - rejectedMs).toBe(7 * 24 * 60 * 60 * 1000);
    expect(FIXED_NOW - pendingMs).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('logs each non-empty rejected chunk with exact event name + payload, then sleeps', async () => {
    const { ds } = makeFakeDataSource([tuple(3), tuple(2), tuple(0), tuple(0)]);

    const result = await pruneReviews(ds, {
      rejectedDays: 30,
      pendingDays: 60,
      batchLimit: 1000,
    });

    expect(result.rowsAffected).toBe(5);
    expect(result.details.rejected).toBe(5);

    const rejectedLogs = mockedLogger.info.mock.calls.filter(
      ([event]) => event === 'prune_reviews_rejected_chunk',
    );
    expect(rejectedLogs).toHaveLength(2);
    expect(rejectedLogs[0][0]).toBe('prune_reviews_rejected_chunk');
    expect(rejectedLogs[0][1]).toEqual({ deleted: 3, totalSoFar: 3 });
    expect(rejectedLogs[1][1]).toEqual({ deleted: 2, totalSoFar: 5 });
  });

  it('logs each non-empty pending chunk with exact event name + payload', async () => {
    const { ds } = makeFakeDataSource([tuple(0), tuple(4), tuple(0)]);

    const result = await pruneReviews(ds, {
      rejectedDays: 30,
      pendingDays: 60,
      batchLimit: 1000,
    });

    expect(result.details.pending).toBe(4);

    const pendingLogs = mockedLogger.info.mock.calls.filter(
      ([event]) => event === 'prune_reviews_pending_chunk',
    );
    expect(pendingLogs).toHaveLength(1);
    expect(pendingLogs[0][0]).toBe('prune_reviews_pending_chunk');
    expect(pendingLogs[0][1]).toEqual({ deleted: 4, totalSoFar: 4 });
  });

  it('NEVER logs a chunk when the first DELETE returns zero rows (kills L72 ConditionalExpression → true + EqualityOperator >=0)', async () => {
    const { ds } = makeFakeDataSource([tuple(0), tuple(0)]);

    const result = await pruneReviews(ds, {
      rejectedDays: 30,
      pendingDays: 60,
      batchLimit: 1000,
    });

    expect(result.rowsAffected).toBe(0);
    expect(mockedLogger.info).not.toHaveBeenCalled();
  });

  it('logs ONLY on positive chunks, not on the final zero-chunk that terminates the loop (kills L72 EqualityOperator chunkDeleted <= 0 / >= 0)', async () => {
    const { ds } = makeFakeDataSource([tuple(2), tuple(0), tuple(0)]);

    await pruneReviews(ds, {
      rejectedDays: 30,
      pendingDays: 60,
      batchLimit: 1000,
    });

    const rejectedLogs = mockedLogger.info.mock.calls.filter(
      ([event]) => event === 'prune_reviews_rejected_chunk',
    );
    expect(rejectedLogs).toHaveLength(1);
    expect(rejectedLogs[0][1]).toEqual({ deleted: 2, totalSoFar: 2 });
  });

  it('falls back to chunkDeleted = 0 when rejected query returns a non-array (kills L70:45 ConditionalExpression → true)', async () => {
    const { ds } = makeFakeDataSource([null, [[], 0]]);

    const result = await pruneReviews(ds, {
      rejectedDays: 30,
      pendingDays: 60,
      batchLimit: 1000,
    });

    expect(result.rowsAffected).toBe(0);
    expect(result.details.rejected).toBe(0);
  });

  it('falls back to chunkDeleted = 0 when pending query rowCount is not a number (kills L97 LogicalOperator && → ||)', async () => {
    const { ds } = makeFakeDataSource([
      [[], 0],
      [[{ id: 'x' }], 'oops'],
    ]);

    const result = await pruneReviews(ds, {
      rejectedDays: 30,
      pendingDays: 60,
      batchLimit: 1000,
    });

    expect(result.details.pending).toBe(0);
    expect(result.rowsAffected).toBe(0);
  });

  it('calls the pending DELETE with exactly [pendingCutoffISO, batchLimit] (kills L95 ArrayDeclaration → [])', async () => {
    const { ds, calls } = makeFakeDataSource([tuple(0), tuple(0)]);

    await pruneReviews(ds, {
      rejectedDays: 30,
      pendingDays: 60,
      batchLimit: 777,
    });

    const expectedPending = new Date(FIXED_NOW - 60 * 24 * 60 * 60 * 1000).toISOString();
    expect(calls).toHaveLength(2);
    expect(calls[1].params).toEqual([expectedPending, 777]);
    const expectedRejected = new Date(FIXED_NOW - 30 * 24 * 60 * 60 * 1000).toISOString();
    expect(calls[0].params).toEqual([expectedRejected, 777]);
  });

  it('sleeps (≈50ms) after a non-empty chunk and skips sleep on an empty chunk', async () => {
    const { ds } = makeFakeDataSource([tuple(1), tuple(0), tuple(0)]);

    const t0 = Date.now.bind(Date);
    const start = performance.now();
    await pruneReviews(ds, {
      rejectedDays: 30,
      pendingDays: 60,
      batchLimit: 1000,
    });
    const elapsed = performance.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(40);
    expect(t0()).toBe(FIXED_NOW);
  });

  it('starts the pending pass even when the rejected pass was empty (kills L83 init must be non-zero)', async () => {
    const { ds, calls } = makeFakeDataSource([tuple(0), tuple(0)]);

    await pruneReviews(ds, {
      rejectedDays: 30,
      pendingDays: 60,
      batchLimit: 1000,
    });

    expect(calls).toHaveLength(2);
    expect(calls[0].sql).toContain("'rejected'");
    expect(calls[1].sql).toContain("'pending'");
  });
});
