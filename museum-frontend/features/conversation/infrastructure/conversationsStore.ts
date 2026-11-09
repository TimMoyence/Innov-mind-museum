import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import type { DashboardSessionCard } from '@/features/chat';
import { storage } from '@/shared/infrastructure/storage';

type SortMode = 'recent' | 'messages';

const LEGACY_SAVED_SESSIONS_KEY = 'dashboard.savedSessions';

interface ConversationsState {
  items: DashboardSessionCard[];
  savedSessionIds: string[];
  sortMode: SortMode;

  setItems: (items: DashboardSessionCard[]) => void;
  appendItems: (items: DashboardSessionCard[]) => void;
  clearItems: () => void;
  removeItems: (sessionIds: string[]) => void;
  toggleSaved: (sessionId: string) => boolean;
  setSortMode: (mode: SortMode) => void;
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
        if (get().savedSessionIds.length > 0) return;
        try {
          const raw = await storage.getItem(LEGACY_SAVED_SESSIONS_KEY);
          if (!raw) return;
          const parsed: unknown = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            const ids = parsed.filter((id): id is string => typeof id === 'string');
            if (ids.length > 0) {
              set({ savedSessionIds: ids });
              await storage.removeItem(LEGACY_SAVED_SESSIONS_KEY);
            }
          }
        } catch {}
      },
    }),
    {
      name: 'musaium.conversations',
      storage: createJSONStorage(() => storage),
      version: 1,
      partialize: (state) => ({
        savedSessionIds: state.savedSessionIds,
        sortMode: state.sortMode,
      }),
    },
  ),
);
