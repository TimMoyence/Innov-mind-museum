import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { storage } from '@/shared/infrastructure/storage';

import type { ArtKeywordDTO, ArtKeywordsSyncState } from '../domain/contracts';

interface ArtKeywordsStoreActions {
  /** Merges newly synced keywords into the store for the given locale. */
  mergeKeywords: (locale: string, keywords: ArtKeywordDTO[], syncedAt: string) => void;
  /** Returns stored keywords for a locale (empty array if none). */
  getKeywords: (locale: string) => ArtKeywordDTO[];
  /** Returns the last sync timestamp for a locale (undefined if never synced). */
  getLastSyncedAt: (locale: string) => string | undefined;
}

type ArtKeywordsStore = ArtKeywordsSyncState & ArtKeywordsStoreActions;

export const useArtKeywordsStore = create<ArtKeywordsStore>()(
  persist(
    (set, get) => ({
      keywordsByLocale: {},
      lastSyncedAt: {},

      mergeKeywords(locale, keywords, syncedAt) {
        set((state) => {
          const existing = state.keywordsByLocale[locale] ?? [];
          const byId = new Map(existing.map((kw) => [kw.id, kw]));
          for (const kw of keywords) {
            byId.set(kw.id, kw);
          }
          return {
            keywordsByLocale: {
              ...state.keywordsByLocale,
              [locale]: [...byId.values()],
            },
            lastSyncedAt: {
              ...state.lastSyncedAt,
              [locale]: syncedAt,
            },
          };
        });
      },

      getKeywords(locale) {
        return get().keywordsByLocale[locale] ?? [];
      },

      getLastSyncedAt(locale) {
        return get().lastSyncedAt[locale];
      },
    }),
    {
      name: 'musaium.artKeywords',
      storage: createJSONStorage(() => storage),
      version: 1,
      partialize: (state) => ({
        keywordsByLocale: state.keywordsByLocale,
        lastSyncedAt: state.lastSyncedAt,
      }),
    },
  ),
);
