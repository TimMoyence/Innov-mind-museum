import type { NextFunction } from 'express';
import { z } from 'zod';
import { validateQuery } from '@src/helpers/middleware/validate-query.middleware';
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
