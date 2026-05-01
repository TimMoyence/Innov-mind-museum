import { z } from 'zod';

import { AppError } from '@shared/errors/app.error';
import { jsonbValidator } from '@shared/db/jsonb-validator';

describe('jsonbValidator transformer', () => {
  const SampleSchema = z.object({ name: z.string(), age: z.number().int().nonnegative() });
  const transformer = jsonbValidator(SampleSchema, 'sample.field');

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
});
