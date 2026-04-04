import '@/__tests__/helpers/test-utils';

import { makeDashboardSessionCard } from '@/__tests__/helpers/factories';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockStorage = new Map<string, string>();

jest.mock('@/shared/infrastructure/storage', () => ({
  storage: {
    getItem: jest.fn((key: string) => Promise.resolve(mockStorage.get(key) ?? null)),
    setItem: jest.fn((key: string, value: string) => {
      mockStorage.set(key, value);
      return Promise.resolve();
    }),
    removeItem: jest.fn((key: string) => {
      mockStorage.delete(key);
      return Promise.resolve();
    }),
  },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
}));

import { useConversationsStore } from '@/features/conversation/infrastructure/conversationsStore';
import { storage } from '@/shared/infrastructure/storage';

// ── Helpers ──────────────────────────────────────────────────────────────────

const resetStore = () => {
  useConversationsStore.setState({
    items: [],
    savedSessionIds: [],
    sortMode: 'recent',
  });
  // Clear mock storage
  mockStorage.clear();
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('conversationsStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStore();
  });

  // ── setItems ───────────────────────────────────────────────────────────────

  describe('setItems', () => {
    it('replaces the full items list', () => {
      const cards = [makeDashboardSessionCard(), makeDashboardSessionCard()];

      useConversationsStore.getState().setItems(cards);

      expect(useConversationsStore.getState().items).toHaveLength(2);
      expect(useConversationsStore.getState().items[0].id).toBe(cards[0].id);
    });

    it('overwrites previous items', () => {
      useConversationsStore.getState().setItems([makeDashboardSessionCard()]);
      expect(useConversationsStore.getState().items).toHaveLength(1);

      const newCards = [
        makeDashboardSessionCard(),
        makeDashboardSessionCard(),
        makeDashboardSessionCard(),
      ];
      useConversationsStore.getState().setItems(newCards);

      expect(useConversationsStore.getState().items).toHaveLength(3);
    });
  });

  // ── appendItems ────────────────────────────────────────────────────────────

  describe('appendItems', () => {
    it('appends items for pagination', () => {
      const firstPage = [makeDashboardSessionCard({ id: 'page1' })];
      const secondPage = [makeDashboardSessionCard({ id: 'page2' })];

      const store = useConversationsStore.getState();
      store.setItems(firstPage);
      useConversationsStore.getState().appendItems(secondPage);

      expect(useConversationsStore.getState().items).toHaveLength(2);
      expect(useConversationsStore.getState().items[0].id).toBe('page1');
      expect(useConversationsStore.getState().items[1].id).toBe('page2');
    });

    it('appends to empty list', () => {
      useConversationsStore.getState().appendItems([makeDashboardSessionCard()]);

      expect(useConversationsStore.getState().items).toHaveLength(1);
    });
  });

  // ── clearItems ─────────────────────────────────────────────────────────────

  describe('clearItems', () => {
    it('empties the items list', () => {
      useConversationsStore.getState().setItems([makeDashboardSessionCard()]);
      expect(useConversationsStore.getState().items).toHaveLength(1);

      useConversationsStore.getState().clearItems();

      expect(useConversationsStore.getState().items).toHaveLength(0);
    });
  });

  // ── removeItems ────────────────────────────────────────────────────────────

  describe('removeItems', () => {
    it('removes specified items from the list', () => {
      const card1 = makeDashboardSessionCard({ id: 'keep' });
      const card2 = makeDashboardSessionCard({ id: 'remove' });
      useConversationsStore.getState().setItems([card1, card2]);

      useConversationsStore.getState().removeItems(['remove']);

      const items = useConversationsStore.getState().items;
      expect(items).toHaveLength(1);
      expect(items[0].id).toBe('keep');
    });

    it('also removes IDs from savedSessionIds', () => {
      const card = makeDashboardSessionCard({ id: 'saved-to-remove' });
      useConversationsStore.getState().setItems([card]);
      useConversationsStore.getState().toggleSaved('saved-to-remove');
      expect(useConversationsStore.getState().savedSessionIds).toContain('saved-to-remove');

      useConversationsStore.getState().removeItems(['saved-to-remove']);

      expect(useConversationsStore.getState().savedSessionIds).not.toContain('saved-to-remove');
    });

    it('handles removing non-existent IDs gracefully', () => {
      const card = makeDashboardSessionCard({ id: 'keep' });
      useConversationsStore.getState().setItems([card]);

      useConversationsStore.getState().removeItems(['non-existent']);

      expect(useConversationsStore.getState().items).toHaveLength(1);
    });
  });

  // ── toggleSaved ────────────────────────────────────────────────────────────

  describe('toggleSaved', () => {
    it('adds session ID to savedSessionIds and returns true', () => {
      const result = useConversationsStore.getState().toggleSaved('sess-1');

      expect(result).toBe(true);
      expect(useConversationsStore.getState().savedSessionIds).toContain('sess-1');
    });

    it('removes session ID on second toggle and returns false', () => {
      useConversationsStore.getState().toggleSaved('sess-1');
      const result = useConversationsStore.getState().toggleSaved('sess-1');

      expect(result).toBe(false);
      expect(useConversationsStore.getState().savedSessionIds).not.toContain('sess-1');
    });

    it('toggles independently across multiple sessions', () => {
      useConversationsStore.getState().toggleSaved('sess-1');
      useConversationsStore.getState().toggleSaved('sess-2');

      expect(useConversationsStore.getState().savedSessionIds).toEqual(['sess-1', 'sess-2']);

      useConversationsStore.getState().toggleSaved('sess-1');

      expect(useConversationsStore.getState().savedSessionIds).toEqual(['sess-2']);
    });
  });

  // ── setSortMode ────────────────────────────────────────────────────────────

  describe('setSortMode', () => {
    it('switches sort mode to messages', () => {
      useConversationsStore.getState().setSortMode('messages');

      expect(useConversationsStore.getState().sortMode).toBe('messages');
    });

    it('switches sort mode back to recent', () => {
      useConversationsStore.getState().setSortMode('messages');
      useConversationsStore.getState().setSortMode('recent');

      expect(useConversationsStore.getState().sortMode).toBe('recent');
    });
  });

  // ── migrateLegacySavedSessions ─────────────────────────────────────────────

  describe('migrateLegacySavedSessions', () => {
    it('imports legacy saved session IDs from storage', async () => {
      mockStorage.set('dashboard.savedSessions', JSON.stringify(['legacy-1', 'legacy-2']));

      await useConversationsStore.getState().migrateLegacySavedSessions();

      expect(useConversationsStore.getState().savedSessionIds).toEqual(['legacy-1', 'legacy-2']);
    });

    it('removes legacy key after successful migration', async () => {
      mockStorage.set('dashboard.savedSessions', JSON.stringify(['legacy-1']));

      await useConversationsStore.getState().migrateLegacySavedSessions();

      expect(storage.removeItem).toHaveBeenCalledWith('dashboard.savedSessions');
    });

    it('skips migration when savedSessionIds already exist', async () => {
      useConversationsStore.setState({ savedSessionIds: ['existing'] });
      mockStorage.set('dashboard.savedSessions', JSON.stringify(['should-not-import']));

      await useConversationsStore.getState().migrateLegacySavedSessions();

      expect(useConversationsStore.getState().savedSessionIds).toEqual(['existing']);
    });

    it('handles missing legacy key gracefully', async () => {
      await useConversationsStore.getState().migrateLegacySavedSessions();

      expect(useConversationsStore.getState().savedSessionIds).toEqual([]);
    });

    it('handles malformed JSON in legacy key gracefully', async () => {
      mockStorage.set('dashboard.savedSessions', 'not-valid-json');

      await useConversationsStore.getState().migrateLegacySavedSessions();

      expect(useConversationsStore.getState().savedSessionIds).toEqual([]);
    });

    it('filters out non-string values from legacy data', async () => {
      mockStorage.set(
        'dashboard.savedSessions',
        JSON.stringify(['valid-id', 42, null, 'another-id']),
      );

      await useConversationsStore.getState().migrateLegacySavedSessions();

      expect(useConversationsStore.getState().savedSessionIds).toEqual(['valid-id', 'another-id']);
    });
  });
});
