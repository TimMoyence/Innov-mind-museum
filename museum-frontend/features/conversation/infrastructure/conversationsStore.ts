import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import type { DashboardSessionCard } from '@/features/chat/domain/dashboard-session';
import { storage } from '@/shared/infrastructure/storage';

type SortMode = 'recent' | 'messages';

/** Key used by the legacy manual AsyncStorage persistence. */
const LEGACY_SAVED_SESSIONS_KEY = 'dashboard.savedSessions';

interface ConversationsState {
  /** Transient: session cards fetched from the API (not persisted). */
  items: DashboardSessionCard[];
  /** Persisted: IDs of sessions the user bookmarked. */
  savedSessionIds: string[];
  /** Persisted: current sort preference. */
  sortMode: SortMode;

  /** Replace the full items list (after API fetch). */
  setItems: (items: DashboardSessionCard[]) => void;
  /** Append items (for pagination / load-more). */
  appendItems: (items: DashboardSessionCard[]) => void;
  /** Clear items (e.g. on error). */
  clearItems: () => void;
  /** Remove specific session IDs from items and savedSessionIds. */
  removeItems: (sessionIds: string[]) => void;
  /** Toggle a session's saved/bookmarked status. Returns true if the session is now saved. */
  toggleSaved: (sessionId: string) => boolean;
  /** Set sort mode. */
  setSortMode: (mode: SortMode) => void;
  /** One-time migration: import legacy savedSessionIds from raw AsyncStorage. */
  migrateLegacySavedSessions: () => Promise<void>;
}

export const useConversationsStore = create<ConversationsState>()(
  persist(
    (set, get) => ({
      items: [],
      savedSessionIds: [],
      sortMode: 'recent' as SortMode,

      setItems: (items) => set({ items }),

      appendItems: (newItems) => set((state) => ({ items: [...state.items, ...newItems] })),

      clearItems: () => set({ items: [] }),

      removeItems: (sessionIds) =>
        set((state) => ({
          items: state.items.filter((item) => !sessionIds.includes(item.id)),
          savedSessionIds: state.savedSessionIds.filter((id) => !sessionIds.includes(id)),
        })),

      toggleSaved: (sessionId) => {
        const current = get().savedSessionIds;
        const exists = current.includes(sessionId);
        const next = exists ? current.filter((id) => id !== sessionId) : [...current, sessionId];
        set({ savedSessionIds: next });
        return !exists;
      },

      setSortMode: (mode) => set({ sortMode: mode }),

      migrateLegacySavedSessions: async () => {
        // Only migrate if the store has no saved sessions yet
        if (get().savedSessionIds.length > 0) return;
        try {
          const raw = await storage.getItem(LEGACY_SAVED_SESSIONS_KEY);
          if (!raw) return;
          const parsed: unknown = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            const ids = parsed.filter((id): id is string => typeof id === 'string');
            if (ids.length > 0) {
              set({ savedSessionIds: ids });
              // Clean up legacy key after successful migration
              await storage.removeItem(LEGACY_SAVED_SESSIONS_KEY);
            }
          }
        } catch {
          // Migration failure is non-critical — user can re-save
        }
      },
    }),
    {
      name: 'musaium.conversations',
      storage: createJSONStorage(() => storage),
      version: 1,
      // Only persist savedSessionIds and sortMode — items are transient API data
      partialize: (state) => ({
        savedSessionIds: state.savedSessionIds,
        sortMode: state.sortMode,
      }),
    },
  ),
);
