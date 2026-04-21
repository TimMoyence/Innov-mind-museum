import type { NextFunction } from 'express';
import { z } from 'zod';
import { validateBody } from '@src/helpers/middleware/validate-body.middleware';
import { AppError } from '@shared/errors/app.error';
import { makePartialRequest, makePartialResponse } from '../../helpers/http/express-mock.helpers';

const mockReq = (body: unknown) => makePartialRequest({ body });
const mockRes = makePartialResponse;

const noop: NextFunction = jest.fn();

const testSchema = z.object({
  email: z.string().email(),
  age: z.number().int().positive(),
});

describe('validateBody middleware', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls next() and replaces req.body with parsed data on valid input', () => {
    const req = mockReq({ email: 'user@example.com', age: 25 });
    const res = mockRes();

    validateBody(testSchema)(req, res, noop);

    expect(noop).toHaveBeenCalled();
    expect(req.body).toEqual({ email: 'user@example.com', age: 25 });
  });

  it('strips unknown properties from req.body', () => {
    const req = mockReq({ email: 'user@example.com', age: 25, extra: 'noise' });
    const res = mockRes();

    validateBody(testSchema)(req, res, noop);

    expect(noop).toHaveBeenCalled();
    expect(req.body).toEqual({ email: 'user@example.com', age: 25 });
    expect(req.body).not.toHaveProperty('extra');
  });

  it('throws BAD_REQUEST AppError for invalid email', () => {
    const req = mockReq({ email: 'not-an-email', age: 25 });
    const res = mockRes();

    expect(() => validateBody(testSchema)(req, res, noop)).toThrow(AppError);

    try {
      validateBody(testSchema)(req, res, noop);
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(400);
      expect((err as AppError).code).toBe('BAD_REQUEST');
      expect((err as AppError).message).toContain('email');
    }
  });

  it('throws BAD_REQUEST AppError when required field is missing', () => {
    const req = mockReq({ email: 'user@example.com' });
    const res = mockRes();

    expect(() => validateBody(testSchema)(req, res, noop)).toThrow(AppError);

    try {
      validateBody(testSchema)(req, res, noop);
    } catch (err) {
      expect((err as AppError).statusCode).toBe(400);
      expect((err as AppError).message).toContain('age');
    }
  });

  it('throws BAD_REQUEST AppError when field has wrong type', () => {
    const req = mockReq({ email: 'user@example.com', age: 'twenty' });
    const res = mockRes();

    expect(() => validateBody(testSchema)(req, res, noop)).toThrow(AppError);

    try {
      validateBody(testSchema)(req, res, noop);
    } catch (err) {
      expect((err as AppError).statusCode).toBe(400);
      expect((err as AppError).message).toContain('age');
    }
  });

  it('throws BAD_REQUEST AppError when body is null', () => {
    const req = mockReq(null);
    const res = mockRes();

    expect(() => validateBody(testSchema)(req, res, noop)).toThrow(AppError);
  });

  it('throws BAD_REQUEST AppError when body is undefined', () => {
    const req = mockReq(undefined);
    const res = mockRes();

    expect(() => validateBody(testSchema)(req, res, noop)).toThrow(AppError);
  });

  it('includes all field errors in the message when multiple fields fail', () => {
    const req = mockReq({ email: 'bad', age: -1 });
    const res = mockRes();

    try {
      validateBody(testSchema)(req, res, noop);
    } catch (err) {
      expect((err as AppError).message).toContain('email');
      expect((err as AppError).message).toContain('age');
    }
  });

  it('works with optional fields', () => {
    const optionalSchema = z.object({
      name: z.string(),
      nickname: z.string().optional(),
    });

    const req = mockReq({ name: 'Alice' });
    const res = mockRes();

    validateBody(optionalSchema)(req, res, noop);

    expect(noop).toHaveBeenCalled();
    expect(req.body).toEqual({ name: 'Alice' });
  });

  it('validates string constraints (min/max)', () => {
    const constrainedSchema = z.object({
      password: z.string().min(8).max(128),
    });

    const req = mockReq({ password: 'short' });
    const res = mockRes();

    expect(() => validateBody(constrainedSchema)(req, res, noop)).toThrow(AppError);
  });
});
