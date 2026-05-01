import {
  AccessibilitySchema,
  AdmissionFeesSchema,
  CollectionsSchema,
  CurrentExhibitionsSchema,
  OpeningHoursSchema,
  SourceUrlsSchema,
} from '@shared/db/jsonb-schemas/museum-enrichment.schemas';

describe('OpeningHoursSchema', () => {
  it('accepts a valid record', () => {
    expect(OpeningHoursSchema.safeParse({ monday: '09:00-18:00' }).success).toBe(true);
  });
  it('accepts an empty object', () => {
    expect(OpeningHoursSchema.safeParse({}).success).toBe(true);
  });
  it('rejects a primitive', () => {
    expect(OpeningHoursSchema.safeParse('closed').success).toBe(false);
  });
  it('rejects an array', () => {
    expect(OpeningHoursSchema.safeParse([]).success).toBe(false);
  });
});

describe('AdmissionFeesSchema', () => {
  it('accepts a valid record', () => {
    expect(AdmissionFeesSchema.safeParse({ adult: '15 EUR' }).success).toBe(true);
  });
  it('accepts an empty object', () => {
    expect(AdmissionFeesSchema.safeParse({}).success).toBe(true);
  });
  it('rejects a number', () => {
    expect(AdmissionFeesSchema.safeParse(15).success).toBe(false);
  });
});

describe('CollectionsSchema', () => {
  it('accepts a valid record', () => {
    expect(CollectionsSchema.safeParse({ impressionism: true }).success).toBe(true);
  });
  it('accepts an empty object', () => {
    expect(CollectionsSchema.safeParse({}).success).toBe(true);
  });
  it('rejects a string', () => {
    expect(CollectionsSchema.safeParse('paintings').success).toBe(false);
  });
});

describe('CurrentExhibitionsSchema', () => {
  it('accepts a valid record', () => {
    expect(CurrentExhibitionsSchema.safeParse({ title: 'Monet', open: true }).success).toBe(true);
  });
  it('accepts an empty object', () => {
    expect(CurrentExhibitionsSchema.safeParse({}).success).toBe(true);
  });
  it('rejects an array', () => {
    expect(CurrentExhibitionsSchema.safeParse([{ title: 'Monet' }]).success).toBe(false);
  });
});

describe('AccessibilitySchema', () => {
  it('accepts a valid record', () => {
    expect(AccessibilitySchema.safeParse({ wheelchair: 'yes' }).success).toBe(true);
  });
  it('accepts an empty object', () => {
    expect(AccessibilitySchema.safeParse({}).success).toBe(true);
  });
  it('rejects a boolean', () => {
    expect(AccessibilitySchema.safeParse(true).success).toBe(false);
  });
});

describe('SourceUrlsSchema', () => {
  it('accepts an empty array', () => {
    expect(SourceUrlsSchema.safeParse([]).success).toBe(true);
  });
  it('accepts an array of URL strings', () => {
    expect(SourceUrlsSchema.safeParse(['https://example.com', 'https://louvre.fr']).success).toBe(
      true,
    );
  });
  it('rejects an array exceeding 256 entries', () => {
    const tooMany = Array.from({ length: 257 }, (_, i) => `item-${i}`);
    expect(SourceUrlsSchema.safeParse(tooMany).success).toBe(false);
  });
  it('rejects a non-array', () => {
    expect(SourceUrlsSchema.safeParse('https://example.com').success).toBe(false);
  });
  it('rejects array with non-string elements', () => {
    expect(SourceUrlsSchema.safeParse([1, 2, 3]).success).toBe(false);
  });
});
