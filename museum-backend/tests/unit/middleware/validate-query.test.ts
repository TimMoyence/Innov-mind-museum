import type { NextFunction } from 'express';
import { z } from 'zod';
import { validateQuery } from '@shared/middleware/validate-query.middleware';
import { validateBody } from '@shared/middleware/validate-body.middleware';
import { formatZodIssues } from '@shared/validation/zod-issue.formatter';
import { AppError } from '@shared/errors/app.error';
import { makePartialRequest, makePartialResponse } from '../../helpers/http/express-mock.helpers';

const mockReq = (query: Record<string, string | string[]>) => makePartialRequest({ query });
const mockRes = makePartialResponse;

const noop: NextFunction = jest.fn();

const testSchema = z.object({
  page: z.coerce.number().int().positive(),
  limit: z.coerce.number().int().positive().optional(),
});

describe('validateQuery middleware', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls next() and sets res.locals.validatedQuery on valid input', () => {
    const req = mockReq({ page: '1', limit: '20' });
    const res = mockRes();

    validateQuery(testSchema)(req, res, noop);

    expect(noop).toHaveBeenCalled();
    expect(res.locals.validatedQuery).toEqual({ page: 1, limit: 20 });
  });

  it('coerces string query params to numbers via z.coerce.number()', () => {
    const req = mockReq({ page: '42' });
    const res = mockRes();

    validateQuery(testSchema)(req, res, noop);

    expect(res.locals.validatedQuery).toEqual({ page: 42 });
    expect(typeof res.locals.validatedQuery.page).toBe('number');
  });

  it('does NOT assign to req.query (Express 5 read-only compat)', () => {
    const query = Object.freeze({ page: '5', limit: '10' }) as Record<string, string | string[]>;
    const req = mockReq(query);
    const res = mockRes();

    // Should not throw even though req.query is frozen
    expect(() => {
      validateQuery(testSchema)(req, res, noop);
    }).not.toThrow();
    expect(res.locals.validatedQuery).toEqual({ page: 5, limit: 10 });
    // req.query should remain the original string values
    expect(req.query).toEqual({ page: '5', limit: '10' });
  });

  it('throws BAD_REQUEST AppError when required field is missing', () => {
    const req = mockReq({});
    const res = mockRes();

    expect(() => {
      validateQuery(testSchema)(req, res, noop);
    }).toThrow(AppError);

    try {
      validateQuery(testSchema)(req, res, noop);
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(400);
      expect((err as AppError).code).toBe('BAD_REQUEST');
      expect((err as AppError).message).toContain('page');
    }
  });

  it('throws BAD_REQUEST AppError when field fails validation', () => {
    const req = mockReq({ page: 'not-a-number' });
    const res = mockRes();

    expect(() => {
      validateQuery(testSchema)(req, res, noop);
    }).toThrow(AppError);

    try {
      validateQuery(testSchema)(req, res, noop);
    } catch (err) {
      expect((err as AppError).statusCode).toBe(400);
      expect((err as AppError).code).toBe('BAD_REQUEST');
    }
  });

  it('includes all field errors in the message when multiple fields fail', () => {
    const strictSchema = z.object({
      page: z.coerce.number().int().positive(),
      limit: z.coerce.number().int().positive(),
    });
    const req = mockReq({ page: 'abc', limit: 'xyz' });
    const res = mockRes();

    try {
      validateQuery(strictSchema)(req, res, noop);
    } catch (err) {
      expect((err as AppError).message).toContain('page');
      expect((err as AppError).message).toContain('limit');
    }
  });

  it('handles optional fields — omitted optional field does not cause error', () => {
    const req = mockReq({ page: '3' });
    const res = mockRes();

    validateQuery(testSchema)(req, res, noop);

    expect(noop).toHaveBeenCalled();
    expect(res.locals.validatedQuery).toEqual({ page: 3 });
    expect(res.locals.validatedQuery).not.toHaveProperty('limit');
  });

  it('handles optional field with default value', () => {
    const schemaWithDefault = z.object({
      page: z.coerce.number().int().positive().default(1),
      sort: z.string().default('asc'),
    });
    const req = mockReq({});
    const res = mockRes();

    validateQuery(schemaWithDefault)(req, res, noop);

    expect(noop).toHaveBeenCalled();
    expect(res.locals.validatedQuery).toEqual({ page: 1, sort: 'asc' });
  });

  it('does not call next() when validation fails', () => {
    const req = mockReq({ page: '-5' });
    const res = mockRes();

    try {
      validateQuery(testSchema)(req, res, noop);
    } catch {
      // expected
    }

    expect(noop).not.toHaveBeenCalled();
  });
});

/**
 * UFR-022 RED phase — RUN_ID 2026-05-23-pr-4-formatZodIssues.
 *
 * Wire-format parity guards between validateQuery and validateBody.
 * Canonical formatter = `@shared/validation/zod-issue.formatter` ; see spec §5 AC2
 * and design.md §4.2. These cases MUST fail before the green codemod
 * (current inline `${path.join('.')}: ${msg}` diverges from `formatZodIssues`).
 */
describe('validateQuery — wire-format parity with validateBody', () => {
  beforeEach(() => jest.clearAllMocks());

  // Helper: run a middleware and return the thrown AppError's message.
  const captureMessage = (run: () => void): string => {
    try {
      run();
    } catch (err) {
      if (err instanceof AppError) return err.message;
      throw err;
    }
    throw new Error('expected middleware to throw AppError but it did not');
  };

  it('C1 — single field error: query message byte-equal to body message (canonical "<path> <message>" form, no colon prefix)', () => {
    const schema = z.object({ q: z.string().min(1) });

    const queryReq = makePartialRequest({ query: { q: '' } });
    const queryRes = makePartialResponse();
    const queryMsg = captureMessage(() => {
      validateQuery(schema)(queryReq, queryRes, noop);
    });

    const bodyReq = makePartialRequest({ body: { q: '' } });
    const bodyRes = makePartialResponse();
    const bodyMsg = captureMessage(() => {
      validateBody(schema)(bodyReq, bodyRes, noop);
    });

    // Parity: both middlewares MUST produce byte-equal messages.
    expect(queryMsg).toBe(bodyMsg);
    // Canonical form: starts with `q ` (space, not colon).
    expect(queryMsg).toMatch(/^q /);
    // Negative regression: no `<field>: ` prefix anywhere at start.
    expect(queryMsg).not.toMatch(/^\w+: /);
  });

  it('C2 — root error (empty path): query message identical to canonical formatZodIssues output (raw message, no ": " prefix)', () => {
    const schema = z.object({ q: z.string() });

    const queryReq = makePartialRequest({
      query: 'not-an-object' as unknown as Record<string, string>,
    });
    const queryRes = makePartialResponse();
    const queryMsg = captureMessage(() => {
      validateQuery(schema)(queryReq, queryRes, noop);
    });

    // Compute the canonical expected wire format directly from formatZodIssues
    // for the same issue set, ensuring byte-equal parity.
    const probe = schema.safeParse('not-an-object');
    expect(probe.success).toBe(false);
    if (probe.success) throw new Error('unreachable: schema must reject string');
    const canonical = formatZodIssues(probe.error.issues);

    expect(queryMsg).toBe(canonical);
    // Root error MUST NOT be prefixed by ": " (legacy inline bug).
    expect(queryMsg).not.toMatch(/^: /);
  });

  it('C3 — dedupe: issue whose message already starts with its path MUST NOT be double-prefixed', () => {
    // `.refine` with a custom message that includes the field name in its prose.
    const schema = z.object({
      q: z.string().refine(() => false, { message: 'q must be set' }),
    });

    const queryReq = makePartialRequest({ query: { q: 'whatever' } });
    const queryRes = makePartialResponse();
    const queryMsg = captureMessage(() => {
      validateQuery(schema)(queryReq, queryRes, noop);
    });

    // Canonical dedupe branch of formatZodIssue → no "q: q must be set" double-prefix.
    expect(queryMsg).toBe('q must be set');
    expect(queryMsg).not.toMatch(/^q: q /);
  });

  it('C4 — empty issues edge case: defensive fallback to "Invalid payload" (not empty string)', () => {
    // Synthesise a schema whose safeParse yields success:false with issues:[]
    // to exercise the defensive branch of formatZodIssues.
    const fakeSchema = {
      safeParse: () => ({ success: false as const, error: { issues: [] as z.core.$ZodIssue[] } }),
    } as unknown as z.ZodType;

    const queryReq = makePartialRequest({ query: {} });
    const queryRes = makePartialResponse();
    const queryMsg = captureMessage(() => {
      validateQuery(fakeSchema)(queryReq, queryRes, noop);
    });

    // Canonical formatter returns 'Invalid payload' for empty issues; legacy
    // inline produced '' (empty string).
    expect(queryMsg).toBe('Invalid payload');
    expect(queryMsg).not.toBe('');
  });

  it('C5 — negative sentinel: no "<field>: " colon-form prefix in any validateQuery 400 message', () => {
    const schema = z.object({ q: z.string().min(1) });

    const queryReq = makePartialRequest({ query: { q: '' } });
    const queryRes = makePartialResponse();
    const queryMsg = captureMessage(() => {
      validateQuery(schema)(queryReq, queryRes, noop);
    });

    // Anti-regression: even if a future hand edit reintroduces the inline
    // `${path}: ${message}` form, this assertion catches it.
    expect(queryMsg).not.toMatch(/^\w+: /);
  });
});
