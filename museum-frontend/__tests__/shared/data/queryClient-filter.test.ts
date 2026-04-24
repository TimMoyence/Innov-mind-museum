import { shouldDehydrateQuery } from '@/shared/data/queryClient';

/**
 * Sensitive query-key prefixes (chat messages, sessions, admin views, auth,
 * user profile) MUST be excluded from AsyncStorage dehydration. The in-memory
 * React Query cache still holds them for runtime use — only the persister
 * roundtrip is suppressed.
 */
describe('queryClient — shouldDehydrateQuery (sensitive filter)', () => {
  const asQuery = (queryKey: readonly unknown[]) => ({ queryKey });

  describe.each([['messages'], ['session'], ['admin'], ['auth'], ['user']])(
    'excludes sensitive prefix "%s"',
    (prefix) => {
      it(`returns false for ['${prefix}']`, () => {
        expect(shouldDehydrateQuery(asQuery([prefix]))).toBe(false);
      });

      it(`returns false for ['${prefix}', 'nested', 'key']`, () => {
        expect(shouldDehydrateQuery(asQuery([prefix, 'nested', 'key']))).toBe(false);
      });
    },
  );

  describe.each([
    [['museum', 'list']],
    [['daily-art']],
    [['art-keywords', 'v1']],
    [['reviews', 'museum-123']],
    [['support', 'faq']],
  ])('keeps safe query key %j', (queryKey) => {
    it('returns true', () => {
      expect(shouldDehydrateQuery(asQuery(queryKey))).toBe(true);
    });
  });

  it('keeps queries with a non-string head (defensive — should not crash)', () => {
    expect(shouldDehydrateQuery(asQuery([42, 'foo']))).toBe(true);
    expect(shouldDehydrateQuery(asQuery([{ scope: 'x' }]))).toBe(true);
  });

  it('keeps an empty query key (pathological but survivable)', () => {
    expect(shouldDehydrateQuery(asQuery([]))).toBe(true);
  });
});
