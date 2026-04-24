// ── AsyncStorage mock ───────────────────────────────────────────────────────
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

import {
  useChatLocalCacheStore,
  MAX_LOCAL_ENTRIES,
  LOCAL_CACHE_TTL_MS,
  type CachedAnswer,
} from '@/features/chat/application/chatLocalCache';

function makeCachedAnswer(overrides: Partial<CachedAnswer> = {}): CachedAnswer {
  return {
    question: 'Who painted the Mona Lisa?',
    answer: 'Leonardo da Vinci painted the Mona Lisa.',
    museumId: 'louvre',
    locale: 'en',
    guideLevel: 'beginner',
    cachedAt: Date.now(),
    source: 'previous-call',
    ...overrides,
  };
}

describe('chatLocalCache store', () => {
  beforeEach(() => {
    // Reset store between tests
    useChatLocalCacheStore.setState({ entries: {} });
  });

  describe('store + lookup', () => {
    it('stores an entry and retrieves it via lookup', () => {
      const entry = makeCachedAnswer();
      useChatLocalCacheStore.getState().store(entry);

      const result = useChatLocalCacheStore.getState().lookup({
        text: entry.question,
        museumId: entry.museumId,
        locale: entry.locale,
        guideLevel: entry.guideLevel,
      });

      expect(result).not.toBeNull();
      expect(result?.answer).toBe(entry.answer);
    });

    it('returns null on cache miss', () => {
      const result = useChatLocalCacheStore.getState().lookup({
        text: 'Unknown question',
        museumId: 'louvre',
        locale: 'en',
      });

      expect(result).toBeNull();
    });

    it('returns null and removes expired entries', () => {
      const expired = makeCachedAnswer({
        cachedAt: Date.now() - LOCAL_CACHE_TTL_MS - 1000,
      });
      useChatLocalCacheStore.getState().store(expired);

      const result = useChatLocalCacheStore.getState().lookup({
        text: expired.question,
        museumId: expired.museumId,
        locale: expired.locale,
        guideLevel: expired.guideLevel,
      });

      expect(result).toBeNull();
      // Entry should have been removed
      expect(Object.keys(useChatLocalCacheStore.getState().entries)).toHaveLength(0);
    });

    it('returns entry just within TTL', () => {
      const justValid = makeCachedAnswer({
        cachedAt: Date.now() - LOCAL_CACHE_TTL_MS + 5000,
      });
      useChatLocalCacheStore.getState().store(justValid);

      const result = useChatLocalCacheStore.getState().lookup({
        text: justValid.question,
        museumId: justValid.museumId,
        locale: justValid.locale,
        guideLevel: justValid.guideLevel,
      });

      expect(result).not.toBeNull();
    });
  });

  describe('normalisation parity', () => {
    it('matches regardless of casing and extra whitespace', () => {
      const entry = makeCachedAnswer({ question: 'who painted the mona lisa?' });
      useChatLocalCacheStore.getState().store(entry);

      const result = useChatLocalCacheStore.getState().lookup({
        text: '  Who  Painted  the  Mona  Lisa?  ',
        museumId: entry.museumId,
        locale: entry.locale,
        guideLevel: entry.guideLevel,
      });

      expect(result).not.toBeNull();
    });
  });

  describe('LRU eviction', () => {
    it('evicts oldest entries when exceeding MAX_LOCAL_ENTRIES', () => {
      const store = useChatLocalCacheStore.getState();

      // Store MAX_LOCAL_ENTRIES + 5 entries
      const now = Date.now();
      const entries: CachedAnswer[] = [];
      for (let i = 0; i < MAX_LOCAL_ENTRIES + 5; i++) {
        entries.push(
          makeCachedAnswer({
            question: `Question number ${String(i)}`,
            cachedAt: now - (MAX_LOCAL_ENTRIES + 5 - i), // increasing timestamp = newer
          }),
        );
      }

      useChatLocalCacheStore.getState().bulkStore(entries);

      const state = useChatLocalCacheStore.getState();
      expect(Object.keys(state.entries)).toHaveLength(MAX_LOCAL_ENTRIES);

      // The oldest 5 should have been evicted
      // The oldest had cachedAt = 1000..1004, so questions 0-4
      const resultOldest = state.lookup({
        text: 'Question number 0',
        museumId: 'louvre',
        locale: 'en',
        guideLevel: 'beginner',
      });
      expect(resultOldest).toBeNull();

      // The newest should still be there
      const resultNewest = state.lookup({
        text: `Question number ${String(MAX_LOCAL_ENTRIES + 4)}`,
        museumId: 'louvre',
        locale: 'en',
        guideLevel: 'beginner',
      });
      expect(resultNewest).not.toBeNull();
    });
  });

  describe('bulkStore', () => {
    it('stores multiple entries at once', () => {
      const entries = [
        makeCachedAnswer({ question: 'Question A' }),
        makeCachedAnswer({ question: 'Question B' }),
        makeCachedAnswer({ question: 'Question C' }),
      ];

      useChatLocalCacheStore.getState().bulkStore(entries);

      expect(Object.keys(useChatLocalCacheStore.getState().entries)).toHaveLength(3);

      for (const entry of entries) {
        const result = useChatLocalCacheStore.getState().lookup({
          text: entry.question,
          museumId: entry.museumId,
          locale: entry.locale,
          guideLevel: entry.guideLevel,
        });
        expect(result).not.toBeNull();
      }
    });

    it('does nothing for empty array', () => {
      useChatLocalCacheStore.getState().store(makeCachedAnswer());
      useChatLocalCacheStore.getState().bulkStore([]);

      expect(Object.keys(useChatLocalCacheStore.getState().entries)).toHaveLength(1);
    });
  });

  describe('clearMuseum', () => {
    it('removes all entries for the given museumId', () => {
      useChatLocalCacheStore
        .getState()
        .store(makeCachedAnswer({ question: 'Q1', museumId: 'louvre' }));
      useChatLocalCacheStore
        .getState()
        .store(makeCachedAnswer({ question: 'Q2', museumId: 'louvre' }));
      useChatLocalCacheStore
        .getState()
        .store(makeCachedAnswer({ question: 'Q3', museumId: 'orsay' }));

      expect(Object.keys(useChatLocalCacheStore.getState().entries)).toHaveLength(3);

      useChatLocalCacheStore.getState().clearMuseum('louvre');

      const state = useChatLocalCacheStore.getState();
      expect(Object.keys(state.entries)).toHaveLength(1);

      // orsay entry should remain
      const result = state.lookup({
        text: 'Q3',
        museumId: 'orsay',
        locale: 'en',
        guideLevel: 'beginner',
      });
      expect(result).not.toBeNull();
    });

    it('does nothing if museumId has no entries', () => {
      useChatLocalCacheStore.getState().store(makeCachedAnswer({ museumId: 'louvre' }));

      useChatLocalCacheStore.getState().clearMuseum('met');

      expect(Object.keys(useChatLocalCacheStore.getState().entries)).toHaveLength(1);
    });
  });

  describe('clearAll', () => {
    it('wipes all entries and clears persisted storage', async () => {
      useChatLocalCacheStore.getState().store(makeCachedAnswer({ question: 'Q1' }));
      useChatLocalCacheStore.getState().store(makeCachedAnswer({ question: 'Q2' }));
      expect(Object.keys(useChatLocalCacheStore.getState().entries)).toHaveLength(2);

      const clearStorageSpy = jest
        .spyOn(useChatLocalCacheStore.persist, 'clearStorage')
        .mockReturnValue(undefined);

      await useChatLocalCacheStore.getState().clearAll();

      expect(Object.keys(useChatLocalCacheStore.getState().entries)).toHaveLength(0);
      expect(clearStorageSpy).toHaveBeenCalledTimes(1);

      clearStorageSpy.mockRestore();
    });

    it('still wipes in-memory entries when persist.clearStorage throws', async () => {
      useChatLocalCacheStore.getState().store(makeCachedAnswer({ question: 'Q1' }));
      expect(Object.keys(useChatLocalCacheStore.getState().entries)).toHaveLength(1);

      const clearStorageSpy = jest
        .spyOn(useChatLocalCacheStore.persist, 'clearStorage')
        .mockImplementation(() => {
          throw new Error('io failure');
        });

      await expect(useChatLocalCacheStore.getState().clearAll()).resolves.toBeUndefined();
      expect(Object.keys(useChatLocalCacheStore.getState().entries)).toHaveLength(0);

      clearStorageSpy.mockRestore();
    });
  });

  describe('pruneExpired', () => {
    it('removes all expired entries', () => {
      useChatLocalCacheStore.getState().store(
        makeCachedAnswer({
          question: 'Old question',
          cachedAt: Date.now() - LOCAL_CACHE_TTL_MS - 1000,
        }),
      );
      useChatLocalCacheStore.getState().store(
        makeCachedAnswer({
          question: 'Recent question',
          cachedAt: Date.now(),
        }),
      );

      useChatLocalCacheStore.getState().pruneExpired();

      const state = useChatLocalCacheStore.getState();
      expect(Object.keys(state.entries)).toHaveLength(1);

      const recent = state.lookup({
        text: 'Recent question',
        museumId: 'louvre',
        locale: 'en',
        guideLevel: 'beginner',
      });
      expect(recent).not.toBeNull();
    });

    it('keeps all entries when none are expired', () => {
      useChatLocalCacheStore.getState().store(makeCachedAnswer({ question: 'Fresh 1' }));
      useChatLocalCacheStore.getState().store(makeCachedAnswer({ question: 'Fresh 2' }));

      useChatLocalCacheStore.getState().pruneExpired();

      expect(Object.keys(useChatLocalCacheStore.getState().entries)).toHaveLength(2);
    });
  });
});
