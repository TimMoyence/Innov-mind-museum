import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { storage } from '@/shared/infrastructure/storage';

import type {
  ArtKeywordDTO,
  ArtKeywordsSyncFailure,
  ArtKeywordsSyncState,
} from '../domain/contracts';

interface ArtKeywordsStoreActions {
  /** Merges newly synced keywords into the store for the given locale. */
  mergeKeywords: (locale: string, keywords: ArtKeywordDTO[], syncedAt: string) => void;
  /** Returns stored keywords for a locale (empty array if none). */
  getKeywords: (locale: string) => ArtKeywordDTO[];
  /** Returns the last sync timestamp for a locale (undefined if never synced). */
  getLastSyncedAt: (locale: string) => string | undefined;
  /** Records a sync failure for a locale — increments the attempt counter. */
  recordSyncFailure: (locale: string, failedAt: string) => void;
  /** Clears the failure state for a locale (called after a successful sync). */
  clearSyncFailure: (locale: string) => void;
  /** Returns the current failure state for a locale (undefined if none). */
  getSyncFailure: (locale: string) => ArtKeywordsSyncFailure | undefined;
}

type ArtKeywordsStore = ArtKeywordsSyncState & ArtKeywordsStoreActions;

export const useArtKeywordsStore = create<ArtKeywordsStore>()(
  persist(
    (set, get) => ({
      keywordsByLocale: {},
      lastSyncedAt: {},
      failuresByLocale: {},

      mergeKeywords(locale, keywords, syncedAt) {
        set((state) => {
          const existing = state.keywordsByLocale[locale] ?? [];
          const byId = new Map(existing.map((kw) => [kw.id, kw]));
          for (const kw of keywords) {
            byId.set(kw.id, kw);
          }
          // Successful merge clears any recorded failure for this locale.
          const nextFailures = Object.fromEntries(
            Object.entries(state.failuresByLocale).filter(([key]) => key !== locale),
          );
          return {
            keywordsByLocale: {
              ...state.keywordsByLocale,
              [locale]: [...byId.values()],
            },
            lastSyncedAt: {
              ...state.lastSyncedAt,
              [locale]: syncedAt,
            },
            failuresByLocale: nextFailures,
          };
        });
      },

      getKeywords(locale) {
        return get().keywordsByLocale[locale] ?? [];
      },

      getLastSyncedAt(locale) {
        return get().lastSyncedAt[locale];
      },

      recordSyncFailure(locale, failedAt) {
        set((state) => {
          const prev = state.failuresByLocale[locale] as ArtKeywordsSyncFailure | undefined;
          const attempts = prev ? prev.attempts + 1 : 1;
          return {
            failuresByLocale: {
              ...state.failuresByLocale,
              [locale]: { lastFailedAt: failedAt, attempts },
            },
          };
        });
      },

      clearSyncFailure(locale) {
        set((state) => {
          const existing = state.failuresByLocale[locale] as ArtKeywordsSyncFailure | undefined;
          if (!existing) return state;
          const next = Object.fromEntries(
            Object.entries(state.failuresByLocale).filter(([key]) => key !== locale),
          );
          return { failuresByLocale: next };
        });
      },

      getSyncFailure(locale) {
        return get().failuresByLocale[locale];
      },
    }),
    {
      name: 'musaium.artKeywords',
      storage: createJSONStorage(() => storage),
      version: 2,
      migrate: (persisted, version) => {
        // v1 → v2 adds failuresByLocale. Any previously persisted state becomes
        // a plain base; we just default the new field.
        const base = (persisted ?? {}) as Partial<ArtKeywordsSyncState>;
        if (version < 2) {
          return {
            keywordsByLocale: base.keywordsByLocale ?? {},
            lastSyncedAt: base.lastSyncedAt ?? {},
            failuresByLocale: {},
          } as ArtKeywordsSyncState;
        }
        return persisted as ArtKeywordsSyncState;
      },
      partialize: (state) => ({
        keywordsByLocale: state.keywordsByLocale,
        lastSyncedAt: state.lastSyncedAt,
        failuresByLocale: state.failuresByLocale,
      }),
    },
  ),
);
