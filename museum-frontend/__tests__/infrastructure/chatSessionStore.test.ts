import '@/__tests__/helpers/test-utils';

import { makeChatUiMessage } from '@/__tests__/helpers/factories';
import { nonNull } from '@/__tests__/helpers/nonNull';

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
}));

import { useChatSessionStore } from '@/features/chat/infrastructure/chatSessionStore';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Reset the Zustand store between tests. */
const resetStore = () => {
  useChatSessionStore.setState({ sessions: {} });
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('chatSessionStore', () => {
  beforeEach(() => {
    resetStore();
  });

  // ── setSession ─────────────────────────────────────────────────────────────

  describe('setSession', () => {
    it('stores a session with messages, title, and museumName', () => {
      const messages = [
        makeChatUiMessage({ role: 'user' }),
        makeChatUiMessage({ role: 'assistant' }),
      ];

      useChatSessionStore.getState().setSession('sess-1', messages, 'Mona Lisa Chat', 'Louvre');

      const session = nonNull(useChatSessionStore.getState().sessions['sess-1']);
      expect(session.messages).toHaveLength(2);
      expect(session.title).toBe('Mona Lisa Chat');
      expect(session.museumName).toBe('Louvre');
    });

    it('sets updatedAt timestamp', () => {
      const before = Date.now();

      useChatSessionStore.getState().setSession('sess-1', [], null, null);

      const session = nonNull(useChatSessionStore.getState().sessions['sess-1']);
      expect(session.updatedAt).toBeGreaterThanOrEqual(before);
      expect(session.updatedAt).toBeLessThanOrEqual(Date.now());
    });

    it('overwrites an existing session with the same ID', () => {
      const msg1 = makeChatUiMessage({ text: 'first' });
      const msg2 = makeChatUiMessage({ text: 'second' });

      const store = useChatSessionStore.getState();
      store.setSession('sess-1', [msg1], 'Old', null);
      store.setSession('sess-1', [msg2], 'New', 'Museum');

      const session = nonNull(useChatSessionStore.getState().sessions['sess-1']);
      expect(session.messages).toHaveLength(1);
      expect(session.messages[0]?.text).toBe('second');
      expect(session.title).toBe('New');
    });
  });

  // ── updateMessages ─────────────────────────────────────────────────────────

  describe('updateMessages', () => {
    it('replaces messages for an existing session', () => {
      const store = useChatSessionStore.getState();
      store.setSession('sess-1', [makeChatUiMessage()], 'Title', null);

      const newMessages = [
        makeChatUiMessage({ role: 'user' }),
        makeChatUiMessage({ role: 'assistant' }),
      ];
      useChatSessionStore.getState().updateMessages('sess-1', newMessages);

      const session = nonNull(useChatSessionStore.getState().sessions['sess-1']);
      expect(session.messages).toHaveLength(2);
    });

    it('preserves title and museumName when updating messages', () => {
      const store = useChatSessionStore.getState();
      store.setSession('sess-1', [], 'Keep Title', 'Keep Museum');

      useChatSessionStore.getState().updateMessages('sess-1', [makeChatUiMessage()]);

      const session = nonNull(useChatSessionStore.getState().sessions['sess-1']);
      expect(session.title).toBe('Keep Title');
      expect(session.museumName).toBe('Keep Museum');
    });

    it('returns unchanged state for non-existent session', () => {
      const before = useChatSessionStore.getState().sessions;

      useChatSessionStore.getState().updateMessages('non-existent', [makeChatUiMessage()]);

      const after = useChatSessionStore.getState().sessions;
      expect(after).toBe(before);
    });

    it('updates the updatedAt timestamp', () => {
      const store = useChatSessionStore.getState();
      store.setSession('sess-1', [], null, null);
      const firstTimestamp = nonNull(useChatSessionStore.getState().sessions['sess-1']).updatedAt;

      // Small delay to ensure different timestamp
      useChatSessionStore.getState().updateMessages('sess-1', [makeChatUiMessage()]);

      const newTimestamp = nonNull(useChatSessionStore.getState().sessions['sess-1']).updatedAt;
      expect(newTimestamp).toBeGreaterThanOrEqual(firstTimestamp);
    });
  });

  // ── appendMessage ──────────────────────────────────────────────────────────

  describe('appendMessage', () => {
    it('appends a message to an existing session', () => {
      const existing = makeChatUiMessage({ role: 'user', text: 'Hello' });
      useChatSessionStore.getState().setSession('sess-1', [existing], null, null);

      const newMsg = makeChatUiMessage({ role: 'assistant', text: 'Hi there' });
      useChatSessionStore.getState().appendMessage('sess-1', newMsg);

      const messages = nonNull(useChatSessionStore.getState().sessions['sess-1']).messages;
      expect(messages).toHaveLength(2);
      expect(messages[1]?.text).toBe('Hi there');
    });

    it('does not modify state for non-existent session', () => {
      const before = useChatSessionStore.getState().sessions;

      useChatSessionStore.getState().appendMessage('non-existent', makeChatUiMessage());

      const after = useChatSessionStore.getState().sessions;
      expect(after).toBe(before);
    });
  });

  // ── clearSession ───────────────────────────────────────────────────────────

  describe('clearSession', () => {
    it('removes the session from the store', () => {
      useChatSessionStore.getState().setSession('sess-1', [makeChatUiMessage()], null, null);
      expect(useChatSessionStore.getState().sessions['sess-1']).toBeDefined();

      useChatSessionStore.getState().clearSession('sess-1');

      expect(useChatSessionStore.getState().sessions['sess-1']).toBeUndefined();
    });

    it('leaves other sessions untouched', () => {
      const store = useChatSessionStore.getState();
      store.setSession('sess-1', [makeChatUiMessage()], 'A', null);
      store.setSession('sess-2', [makeChatUiMessage()], 'B', null);

      useChatSessionStore.getState().clearSession('sess-1');

      expect(useChatSessionStore.getState().sessions['sess-1']).toBeUndefined();
      expect(useChatSessionStore.getState().sessions['sess-2']).toBeDefined();
    });

    it('is a no-op for non-existent session ID', () => {
      useChatSessionStore.getState().setSession('sess-1', [], null, null);

      useChatSessionStore.getState().clearSession('non-existent');

      expect(useChatSessionStore.getState().sessions['sess-1']).toBeDefined();
    });
  });

  // ── Eviction ───────────────────────────────────────────────────────────────

  describe('eviction', () => {
    it('evicts oldest sessions when exceeding MAX_PERSISTED_SESSIONS (10)', () => {
      jest.useFakeTimers();
      resetStore();

      // Create 10 sessions with sequential timestamps (1 second apart)
      for (let i = 0; i < 10; i++) {
        jest.setSystemTime(new Date(2026, 0, 1, 0, 0, i));
        useChatSessionStore
          .getState()
          .setSession(`sess-${String(i)}`, [makeChatUiMessage()], `Title ${String(i)}`, null);
      }

      expect(Object.keys(useChatSessionStore.getState().sessions)).toHaveLength(10);

      // Adding the 11th should evict the oldest (sess-0 has the smallest updatedAt)
      jest.setSystemTime(new Date(2026, 0, 1, 0, 0, 10));
      useChatSessionStore.getState().setSession('sess-new', [makeChatUiMessage()], 'New', null);

      const sessionKeys = Object.keys(useChatSessionStore.getState().sessions);
      expect(sessionKeys).toHaveLength(10);
      // The newest session should be present
      expect(useChatSessionStore.getState().sessions['sess-new']).toBeDefined();
      // The oldest session (sess-0) should have been evicted
      expect(useChatSessionStore.getState().sessions['sess-0']).toBeUndefined();

      jest.useRealTimers();
    });

    it('keeps the most recently updated sessions', () => {
      jest.useFakeTimers();
      resetStore();

      // Create 12 sessions with sequential timestamps
      for (let i = 0; i < 12; i++) {
        jest.setSystemTime(new Date(2026, 0, 1, 0, 0, i));
        useChatSessionStore
          .getState()
          .setSession(`sess-${String(i)}`, [makeChatUiMessage()], null, null);
      }

      const sessionCount = Object.keys(useChatSessionStore.getState().sessions).length;
      expect(sessionCount).toBeLessThanOrEqual(10);

      jest.useRealTimers();
    });
  });
});
