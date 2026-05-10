import { z } from 'zod';

import { jsonbValidator } from '@shared/db/jsonb-validator';
import { AppError } from '@shared/errors/app.error';
import { logger } from '@shared/logger/logger';

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

describe('jsonbValidator transformer', () => {
  const SampleSchema = z.object({ name: z.string(), age: z.number().int().nonnegative() });
  const transformer = jsonbValidator(SampleSchema, 'sample.field');

  beforeEach(() => {
    (logger.warn as jest.Mock).mockClear();
  });

  it('passes valid value through `to` unchanged', () => {
    const value = { name: 'Anon', age: 30 };
    expect(transformer.to(value)).toEqual(value);
  });

  it('returns null on `to` when value is null', () => {
    expect(transformer.to(null)).toBeNull();
  });

  it('returns undefined on `to` when value is undefined', () => {
    expect(transformer.to(undefined)).toBeUndefined();
  });

  it('throws AppError(422) on invalid value', () => {
    let caught: unknown;
    try {
      transformer.to({ name: 'Anon', age: -1 });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(AppError);
    expect(caught).toMatchObject({ statusCode: 422, code: 'JSONB_VALIDATION' });
  });

  it('reports the field path in details on invalid', () => {
    try {
      transformer.to({ name: 123 });
    } catch (err) {
      expect((err as AppError).details).toMatchObject({
        field: 'sample.field',
        issues: expect.arrayContaining([expect.objectContaining({ path: 'name' })]),
      });
    }
  });

  it('returns identity on `from`', () => {
    const value = { stale: 'shape' };
    expect(transformer.from(value)).toBe(value);
  });

  // Joins nested issue paths with "." (kills the L31 StringLiteral mutant
  // that replaces the dot separator with "").
  it('joins nested issue paths with a dot separator', () => {
    const NestedSchema = z.object({ inner: z.object({ x: z.string() }) });
    const t = jsonbValidator(NestedSchema, 'nested.col');
    expect.assertions(1);
    try {
      t.to({ inner: { x: 42 } });
    } catch (err) {
      expect((err as AppError).details).toMatchObject({
        issues: expect.arrayContaining([expect.objectContaining({ path: 'inner.x' })]),
      });
    }
  });

  // Logger event name + payload shape (kills the L34 StringLiteral and
  // ObjectLiteral mutants on logger.warn(...)).
  it('logs jsonb_validation_failed with field + issues meta on invalid value', () => {
    try {
      transformer.to({ name: 'bad', age: -1 });
    } catch {
      // expected throw
    }
    expect(logger.warn).toHaveBeenCalledWith(
      'jsonb_validation_failed',
      expect.objectContaining({
        field: 'sample.field',
        issues: expect.arrayContaining([expect.objectContaining({ path: 'age' })]),
      }),
    );
  });

  // AppError message embeds the field name (kills the L36 StringLiteral
  // template-literal mutant that empties the message).
  it('throws AppError with a message naming the offending field', () => {
    try {
      transformer.to({ name: 'bad', age: -1 });
      throw new Error('expected throw');
    } catch (err) {
      expect((err as AppError).message).toBe('Invalid JSONB shape for sample.field');
    }
  });
});
