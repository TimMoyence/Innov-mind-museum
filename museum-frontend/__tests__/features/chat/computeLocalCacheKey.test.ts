import {
  GENERIC_TEXT_MAX_LEN,
  MAX_CACHE_KEY_BYTES,
  computeLocalCacheKey,
  isGenericQuery,
  normalizeQuestion,
  type LocalCacheKeyInput,
} from '@/features/chat/application/computeLocalCacheKey';

const baseInput = (overrides: Partial<LocalCacheKeyInput> = {}): LocalCacheKeyInput => ({
  text: 'What is this painting?',
  museumId: 'mus-1',
  locale: 'en',
  hasHistory: false,
  hasAttachment: false,
  hasGeo: false,
  ...overrides,
});

describe('normalizeQuestion', () => {
  it('lowercases the input', () => {
    expect(normalizeQuestion('Hello World')).toBe('hello world');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalizeQuestion('   hi   ')).toBe('hi');
  });

  it('collapses runs of whitespace into a single space', () => {
    expect(normalizeQuestion('a    b\t\tc\n\nd')).toBe('a b c d');
  });

  it('returns an empty string for whitespace-only input', () => {
    expect(normalizeQuestion('   \t\n  ')).toBe('');
  });
});

describe('isGenericQuery — Option C scoping classifier', () => {
  it('returns true for the canonical generic case (no history, no attachment, no geo, short text)', () => {
    expect(isGenericQuery(baseInput())).toBe(true);
  });

  it('returns false when history flag is present', () => {
    expect(isGenericQuery(baseInput({ hasHistory: true }))).toBe(false);
  });

  it('returns false when attachment flag is present', () => {
    expect(isGenericQuery(baseInput({ hasAttachment: true }))).toBe(false);
  });

  it('returns false when geo flag is present', () => {
    expect(isGenericQuery(baseInput({ hasGeo: true }))).toBe(false);
  });

  it('returns false when text length is at or above GENERIC_TEXT_MAX_LEN', () => {
    expect(isGenericQuery(baseInput({ text: 'x'.repeat(GENERIC_TEXT_MAX_LEN) }))).toBe(false);
  });

  it('default-safe: every undefined flag is treated as TRUE → returns false', () => {
    expect(
      isGenericQuery({
        text: 'short',
        museumId: 'mus-1',
        locale: 'en',
        // No hasHistory / hasAttachment / hasGeo at all.
      }),
    ).toBe(false);
  });

  it('returns false when text is not a string (e.g. accidentally null upstream)', () => {
    expect(isGenericQuery({ ...baseInput(), text: null as unknown as string })).toBe(false);
  });
});

describe('computeLocalCacheKey — namespace selection', () => {
  it('emits a global key for a generic query', () => {
    const key = computeLocalCacheKey(baseInput({ text: 'hello' }));
    expect(key).toMatch(/^chat:llm:global:mus-1:[a-f0-9]{16}$/);
  });

  it('emits a user-scoped key when userId is provided AND query is non-generic', () => {
    const key = computeLocalCacheKey(baseInput({ hasHistory: true, userId: 42 }));
    expect(key).toMatch(/^chat:llm:user:42:mus-1:[a-f0-9]{16}$/);
  });

  it('emits an anon-scoped key when only anonId is provided', () => {
    const key = computeLocalCacheKey(baseInput({ hasHistory: true, anonId: 'anon-abc' }));
    expect(key).toMatch(/^chat:llm:anon:anon-abc:mus-1:[a-f0-9]{16}$/);
  });

  it('prefers userId over anonId when both are present (auth wins)', () => {
    const key = computeLocalCacheKey(baseInput({ hasHistory: true, userId: 7, anonId: 'anon-x' }));
    expect(key).toMatch(/^chat:llm:user:7:mus-1:/);
  });

  it('throws on a scoped request with neither userId nor anonId — refuses global leak', () => {
    expect(() => computeLocalCacheKey(baseInput({ hasHistory: true }))).toThrow(
      /refusing to leak globally/,
    );
  });

  it('coerces a numeric userId of 0 into a non-empty id (preserves namespace)', () => {
    const key = computeLocalCacheKey(baseInput({ hasHistory: true, userId: 0 }));
    expect(key).toMatch(/^chat:llm:user:0:mus-1:/);
  });

  it('treats an empty-string anonId as missing (falls through to throw)', () => {
    expect(() => computeLocalCacheKey(baseInput({ hasHistory: true, anonId: '' }))).toThrow(
      /refusing to leak globally/,
    );
  });
});

describe('computeLocalCacheKey — determinism + geo bucket', () => {
  it('is deterministic across multiple invocations on equal input', () => {
    const input = baseInput({ hasHistory: true, userId: 1 });
    expect(computeLocalCacheKey(input)).toBe(computeLocalCacheKey(input));
  });

  it('differs when locale changes (key is locale-scoped)', () => {
    const a = computeLocalCacheKey(baseInput({ hasHistory: true, userId: 1, locale: 'en' }));
    const b = computeLocalCacheKey(baseInput({ hasHistory: true, userId: 1, locale: 'fr' }));
    expect(a).not.toBe(b);
  });

  it('differs when audioDescriptionMode flips on', () => {
    const a = computeLocalCacheKey(
      baseInput({ hasHistory: true, userId: 1, audioDescriptionMode: false }),
    );
    const b = computeLocalCacheKey(
      baseInput({ hasHistory: true, userId: 1, audioDescriptionMode: true }),
    );
    expect(a).not.toBe(b);
  });

  it('appends the geo bucket to the digest payload when hasGeo + geoBucket are set', () => {
    const withoutGeo = computeLocalCacheKey(
      baseInput({ hasHistory: true, userId: 1, hasGeo: false, geoBucket: 'paris,fr' }),
    );
    const withGeo = computeLocalCacheKey(
      baseInput({ hasHistory: true, userId: 1, hasGeo: true, geoBucket: 'paris,fr' }),
    );
    expect(withoutGeo).not.toBe(withGeo);
  });

  it('ignores an empty-string geoBucket even when hasGeo is true', () => {
    const noBucket = computeLocalCacheKey(
      baseInput({ hasHistory: true, userId: 1, hasGeo: true, geoBucket: '' }),
    );
    const withBucket = computeLocalCacheKey(
      baseInput({ hasHistory: true, userId: 1, hasGeo: true, geoBucket: 'paris,fr' }),
    );
    expect(noBucket).not.toBe(withBucket);
  });

  it('defaults guideLevel to "beginner" when omitted', () => {
    const omit = computeLocalCacheKey(baseInput({ hasHistory: true, userId: 1 }));
    const explicit = computeLocalCacheKey(
      baseInput({ hasHistory: true, userId: 1, guideLevel: 'beginner' }),
    );
    expect(omit).toBe(explicit);
  });
});

describe('computeLocalCacheKey — Redis safety guard', () => {
  it('throws when the assembled key would exceed MAX_CACHE_KEY_BYTES', () => {
    expect(() =>
      computeLocalCacheKey(
        baseInput({
          hasHistory: true,
          userId: 'u'.repeat(MAX_CACHE_KEY_BYTES + 1),
          museumId: 'm'.repeat(MAX_CACHE_KEY_BYTES + 1),
        }),
      ),
    ).toThrow(new RegExp(`exceeds ${MAX_CACHE_KEY_BYTES} bytes`));
  });
});
