/**
 * UFR-022 red phase — PR-5 assertPagination helper.
 * RUN_ID 2026-05-23-pr-5-assertPagination.
 *
 * These tests intentionally FAIL pre-green: `assertPagination` does not yet
 * exist in `@shared/types/pagination` (only the `PaginationParams` and
 * `PaginatedResult<T>` interfaces are exported). Green phase MUST implement
 * the helper per `design.md` §1.1 to make these pass.
 *
 * Frozen-test discipline: this file is sha256-hashed in `red-test-manifest.json`.
 * Green phase MUST NOT modify it. Suspected bug → emit `BLOCK-TEST-WRONG`.
 */
import { AppError } from '@shared/errors/app.error';
import { assertPagination } from '@shared/types/pagination';

describe('assertPagination — page validation (default maxLimit=100)', () => {
  it('throws AppError with wire-format message when page is 0', () => {
    expect(() => assertPagination({ page: 0, limit: 10 })).toThrow(AppError);
    try {
      assertPagination({ page: 0, limit: 10 });
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      const e = err as AppError;
      expect(e.message).toBe('page must be a positive integer');
      expect(e.statusCode).toBe(400);
      expect(e.code).toBe('BAD_REQUEST');
    }
  });

  it('throws when page is -1', () => {
    expect(() => assertPagination({ page: -1, limit: 10 })).toThrow(
      'page must be a positive integer',
    );
  });

  it('throws when page is a non-integer float (1.5)', () => {
    expect(() => assertPagination({ page: 1.5, limit: 10 })).toThrow(
      'page must be a positive integer',
    );
  });

  it('throws when page is NaN', () => {
    expect(() => assertPagination({ page: Number.NaN, limit: 10 })).toThrow(
      'page must be a positive integer',
    );
  });

  it('throws when page is Infinity', () => {
    expect(() => assertPagination({ page: Number.POSITIVE_INFINITY, limit: 10 })).toThrow(
      'page must be a positive integer',
    );
  });
});

describe('assertPagination — limit validation (default maxLimit=100)', () => {
  it('throws AppError with wire-format message when limit is 0', () => {
    try {
      assertPagination({ page: 1, limit: 0 });
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      const e = err as AppError;
      expect(e.message).toBe('limit must be between 1 and 100');
      expect(e.statusCode).toBe(400);
      expect(e.code).toBe('BAD_REQUEST');
    }
  });

  it('throws when limit is -1', () => {
    expect(() => assertPagination({ page: 1, limit: -1 })).toThrow(
      'limit must be between 1 and 100',
    );
  });

  it('throws when limit is a non-integer float (1.5)', () => {
    expect(() => assertPagination({ page: 1, limit: 1.5 })).toThrow(
      'limit must be between 1 and 100',
    );
  });

  it('throws when limit is 101 (just above default maxLimit)', () => {
    expect(() => assertPagination({ page: 1, limit: 101 })).toThrow(
      'limit must be between 1 and 100',
    );
  });

  it('throws when limit is NaN', () => {
    expect(() => assertPagination({ page: 1, limit: Number.NaN })).toThrow(
      'limit must be between 1 and 100',
    );
  });

  it('throws when limit is Infinity', () => {
    expect(() => assertPagination({ page: 1, limit: Number.POSITIVE_INFINITY })).toThrow(
      'limit must be between 1 and 100',
    );
  });
});

describe('assertPagination — happy path return', () => {
  it('returns {page, limit} unchanged for {1, 1}', () => {
    expect(assertPagination({ page: 1, limit: 1 })).toEqual({
      page: 1,
      limit: 1,
    });
  });

  it('returns {page, limit} unchanged for {1, 100} (max edge)', () => {
    expect(assertPagination({ page: 1, limit: 100 })).toEqual({
      page: 1,
      limit: 100,
    });
  });

  it('returns {page, limit} unchanged for large valid pair {999, 50}', () => {
    expect(assertPagination({ page: 999, limit: 50 })).toEqual({
      page: 999,
      limit: 50,
    });
  });
});

describe('assertPagination — ordering (R5: page checked before limit)', () => {
  it('throws page message (NOT limit message) when BOTH are invalid', () => {
    // page=0 invalid AND limit=200 invalid for default max=100 — page check
    // must short-circuit so the message is the page one, not the limit one.
    expect(() => assertPagination({ page: 0, limit: 200 })).toThrow(
      'page must be a positive integer',
    );
  });

  it('does not throw limit message when page is invalid (page=-5, limit=999)', () => {
    try {
      assertPagination({ page: -5, limit: 999 });
      fail('expected throw');
    } catch (err) {
      const e = err as AppError;
      expect(e.message).toBe('page must be a positive integer');
      // Sanity: NOT the limit message.
      expect(e.message).not.toBe('limit must be between 1 and 100');
    }
  });
});

describe('assertPagination — opts.maxLimit override', () => {
  it('accepts limit=200 when opts.maxLimit=200', () => {
    expect(assertPagination({ page: 1, limit: 200 }, { maxLimit: 200 })).toEqual({
      page: 1,
      limit: 200,
    });
  });

  it('throws with the overridden bound in the message when limit=201, maxLimit=200', () => {
    expect(() => assertPagination({ page: 1, limit: 201 }, { maxLimit: 200 })).toThrow(
      'limit must be between 1 and 200',
    );
  });

  it('applies default maxLimit=100 when opts.maxLimit is undefined', () => {
    expect(assertPagination({ page: 1, limit: 50 }, { maxLimit: undefined })).toEqual({
      page: 1,
      limit: 50,
    });
  });

  it('applies default maxLimit=100 when opts itself is undefined (no second arg)', () => {
    expect(assertPagination({ page: 1, limit: 50 })).toEqual({
      page: 1,
      limit: 50,
    });
  });
});

describe('assertPagination — purity (R7: no mutation, no I/O)', () => {
  it('does not mutate a frozen input object', () => {
    const input = Object.freeze({ page: 1, limit: 10 }) as {
      page: number;
      limit: number;
    };
    expect(() => assertPagination(input)).not.toThrow(TypeError);
    expect(assertPagination(input)).toEqual({ page: 1, limit: 10 });
  });

  it('returns a new object (not the same reference as input)', () => {
    // R1 spec returns "{ page, limit } typed" — implementation per design.md
    // §1.1 destructures + returns a fresh literal. Lock that contract so green
    // can't silently `return params` (which would tie callers to input shape
    // for extra fields).
    const input = { page: 1, limit: 10 };
    const result = assertPagination(input);
    expect(result).not.toBe(input);
    expect(result).toEqual({ page: 1, limit: 10 });
  });
});
