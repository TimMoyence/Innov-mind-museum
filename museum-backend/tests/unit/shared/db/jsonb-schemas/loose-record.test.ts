import { LooseRecordSchema } from '@shared/db/jsonb-schemas/loose-record.schema';

describe('LooseRecordSchema', () => {
  it('accepts an empty object', () => {
    expect(LooseRecordSchema.safeParse({}).success).toBe(true);
  });

  it('accepts an arbitrary key-value object', () => {
    expect(LooseRecordSchema.safeParse({ a: 1, b: 'x', c: { nested: true } }).success).toBe(true);
  });

  it('rejects a string primitive', () => {
    expect(LooseRecordSchema.safeParse('raw').success).toBe(false);
  });

  it('rejects a number primitive', () => {
    expect(LooseRecordSchema.safeParse(42).success).toBe(false);
  });

  it('rejects a boolean primitive', () => {
    expect(LooseRecordSchema.safeParse(true).success).toBe(false);
  });

  it('rejects an array', () => {
    expect(LooseRecordSchema.safeParse([1, 2, 3]).success).toBe(false);
  });
});
