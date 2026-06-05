import { shouldDehydrateQuery } from '@/shared/data/queryClient';

/**
 * Sensitive query-key prefixes (chat messages, sessions, admin views, auth,
 * user profile) MUST be excluded from AsyncStorage dehydration. The in-memory
 * React Query cache still holds them for runtime use — only the persister
 * roundtrip is suppressed.
 */
describe('queryClient — shouldDehydrateQuery (sensitive filter)', () => {
  const asQuery = (queryKey: readonly unknown[], status = 'success') => ({
    queryKey,
    state: { status },
  });

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

  // QA-05 regression — a query dehydrated while still PENDING serialises a live
  // promise that rehydrates as a dead one on cold start, surfacing
  // "A query that was dehydrated as pending ended up rejecting / CancelledError"
  // (observed on the ['museums','directory'] list). A custom shouldDehydrateQuery
  // REPLACES React Query's default status gate, so it must re-assert it.
  it('does NOT persist a pending or errored query, even with a non-sensitive key', () => {
    expect(shouldDehydrateQuery(asQuery(['museums', 'directory'], 'pending'))).toBe(false);
    expect(shouldDehydrateQuery(asQuery(['museums', 'directory'], 'error'))).toBe(false);
  });
});
