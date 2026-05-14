/**
 * Targeted mutation kills for `pruneReviews` — written 2026-05-14 to eliminate
 * 19 Stryker survivors (arithmetic / conditional / object-literal / string /
 * unary / block-statement / array mutators). Strict assertions only.
 *
 * Pairs with `prune-reviews.test.ts` (behavioural baseline).
 */
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

describe('pruneReviews — mutation kills', () => {
  const FIXED_NOW = Date.UTC(2026, 4, 14, 12, 0, 0); // 2026-05-14T12:00:00.000Z

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);
    mockedLogger.info.mockClear();
    mockedLogger.warn.mockClear();
    mockedLogger.error.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ── Arithmetic kills (L49 + L50) ───────────────────────────────────
  // Asserts the EXACT ISO cutoff so any operator swap (+, /, missing *) flips.

  it('computes rejected cutoff = NOW - rejectedDays * 24 * 60 * 60 * 1000 (exact ms)', async () => {
    const { ds, calls } = makeFakeDataSource([tuple(0), tuple(0)]);

    const result = await pruneReviews(ds, {
      rejectedDays: 30,
      pendingDays: 60,
      batchLimit: 500,
    });

    // 30 days back = 2026-05-14T12:00 minus 2_592_000_000 ms = 2026-04-14T12:00:00.000Z
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

    // 60 days back = 2026-03-15T12:00:00.000Z
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
    // Exact delta = (30-7) days in ms
    expect(rejectedMs - pendingMs).toBe(23 * 24 * 60 * 60 * 1000);
    // Both must be in the past
    expect(rejectedMs).toBeLessThan(FIXED_NOW);
    expect(pendingMs).toBeLessThan(FIXED_NOW);
    // Rejected stays exactly 7 days back from NOW
    expect(FIXED_NOW - rejectedMs).toBe(7 * 24 * 60 * 60 * 1000);
    expect(FIXED_NOW - pendingMs).toBe(30 * 24 * 60 * 60 * 1000);
  });

  // ── Loop body + log content kills (L70, L72, L73, L97) ────────────

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
    // Exact event name (kills L73:19 StringLiteral → "")
    expect(rejectedLogs[0][0]).toBe('prune_reviews_rejected_chunk');
    // Exact payload (kills L73:51 ObjectLiteral → {})
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
    // Both passes return zero on first attempt: loop must exit without ever
    // entering the `if (chunkDeleted > 0)` branch.
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
    // 2-then-0 sequence: first call logs once, second call must NOT log.
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

  // ── Malformed driver responses → fallback to 0 (kills L70, L97) ───

  it('falls back to chunkDeleted = 0 when rejected query returns a non-array (kills L70:45 ConditionalExpression → true)', async () => {
    // null is not an array → typeof result[1] cannot be 'number' → fallback 0
    // mutant `Array.isArray(result) || typeof result[1] === 'number'` with non-array
    // would crash on `result[1]`; original short-circuits to false → 0.
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
    // pending tuple has rowCount of 'oops' (string). Original = 0 (short-circuit
    // false). Mutant `Array.isArray || typeof === 'number'` = true → would try
    // chunkDeleted = 'oops', NaN arithmetic; OR `Array.isArray && true` = true
    // → assigns string. Both break the result.
    const { ds } = makeFakeDataSource([
      [[], 0],
      [[{ id: 'x' }], 'oops'],
    ]);

    const result = await pruneReviews(ds, {
      rejectedDays: 30,
      pendingDays: 60,
      batchLimit: 1000,
    });

    // Strict: pending count must be 0 (fallback path).
    expect(result.details.pending).toBe(0);
    expect(result.rowsAffected).toBe(0);
  });

  // ── Pending query params (kills L95 ArrayDeclaration → []) ────────

  it('calls the pending DELETE with exactly [pendingCutoffISO, batchLimit] (kills L95 ArrayDeclaration → [])', async () => {
    const { ds, calls } = makeFakeDataSource([tuple(0), tuple(0)]);

    await pruneReviews(ds, {
      rejectedDays: 30,
      pendingDays: 60,
      batchLimit: 777,
    });

    const expectedPending = new Date(FIXED_NOW - 60 * 24 * 60 * 60 * 1000).toISOString();
    // Two queries total
    expect(calls).toHaveLength(2);
    // Pending pass (call #2) parameters — exact tuple [iso, limit]
    expect(calls[1].params).toEqual([expectedPending, 777]);
    // And the rejected pass (call #1) too, for completeness
    const expectedRejected = new Date(FIXED_NOW - 30 * 24 * 60 * 60 * 1000).toISOString();
    expect(calls[0].params).toEqual([expectedRejected, 777]);
  });

  // ── Throttle pause is enforced only when chunkDeleted > 0 ─────────
  // (kills L72:27 BlockStatement → {} when combined with the log assertions)

  it('sleeps (≈50ms) after a non-empty chunk and skips sleep on an empty chunk', async () => {
    // Sequence: 1 → 0 → 0 (2 queries for rejected, then 1 for pending start which is 0).
    // With CHUNK_THROTTLE_MS=50 only after non-empty chunks, total wall time
    // must exceed ~40ms. Without the block (mutant {}), zero sleep happens.
    const { ds } = makeFakeDataSource([tuple(1), tuple(0), tuple(0)]);

    const t0 = Date.now.bind(Date);
    // Restore real timer for this single measurement; Date.now is mocked but
    // perf timing uses performance.now via setTimeout from node:timers/promises.
    const start = performance.now();
    await pruneReviews(ds, {
      rejectedDays: 30,
      pendingDays: 60,
      batchLimit: 1000,
    });
    const elapsed = performance.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(40);
    // Sanity: the mock of Date.now is still effective.
    expect(t0()).toBe(FIXED_NOW);
  });

  // ── Unary kill: L83 `chunkDeleted = -1` ────────────────────────────
  // Pre-pass guard variable. With +1 vs -1 both enter the loop (≠ 0), so
  // behaviour is identical when the first call resets chunkDeleted from the
  // query result. We assert that the loop DOES start the pending pass and
  // performs at least one query — kills the dead branch where chunkDeleted
  // would be initialised to `0` (other unary mutators).

  it('starts the pending pass even when the rejected pass was empty (kills L83 init must be non-zero)', async () => {
    const { ds, calls } = makeFakeDataSource([tuple(0), tuple(0)]);

    await pruneReviews(ds, {
      rejectedDays: 30,
      pendingDays: 60,
      batchLimit: 1000,
    });

    // Must have made BOTH the rejected and the pending DELETE queries.
    expect(calls).toHaveLength(2);
    expect(calls[0].sql).toContain("'rejected'");
    expect(calls[1].sql).toContain("'pending'");
  });
});
