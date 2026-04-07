import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import { storage } from '@/shared/infrastructure/storage';

import { computeLocalCacheKey, type LocalCacheKeyInput } from './computeLocalCacheKey';

/** Maximum number of entries kept in the local cache. */
export const MAX_LOCAL_ENTRIES = 200;

/** Time-to-live for cached entries: 7 days in milliseconds. */
export const LOCAL_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface CachedAnswer {
  question: string;
  answer: string;
  metadata?: Record<string, unknown>;
  museumId: string;
  locale: string;
  guideLevel?: string;
  cachedAt: number;
  source: 'prefetch' | 'previous-call';
}

export interface LookupInput {
  text: string;
  museumId: string;
  locale: string;
  guideLevel?: string;
  audioDescriptionMode?: boolean;
}

interface ChatLocalCacheStore {
  entries: Record<string, CachedAnswer>;
  lookup: (input: LookupInput) => CachedAnswer | null;
  store: (entry: CachedAnswer) => void;
  bulkStore: (entries: CachedAnswer[]) => void;
  clearMuseum: (museumId: string) => void;
  pruneExpired: () => void;
}

/**
 * Evicts the oldest entries by `cachedAt` when the store exceeds MAX_LOCAL_ENTRIES.
 * Returns a new entries record trimmed to the cap.
 */
function evictOldest(entries: Record<string, CachedAnswer>): Record<string, CachedAnswer> {
  const keys = Object.keys(entries);
  if (keys.length <= MAX_LOCAL_ENTRIES) return entries;

  const sorted = keys
    .map((k) => ({ key: k, cachedAt: entries[k].cachedAt }))
    .sort((a, b) => b.cachedAt - a.cachedAt);

  const kept = sorted.slice(0, MAX_LOCAL_ENTRIES);
  const result: Record<string, CachedAnswer> = {};
  for (const { key } of kept) {
    result[key] = entries[key];
  }
  return result;
}

/**
 * Builds a cache key from a CachedAnswer (for store/bulkStore operations).
 */
function keyFromEntry(entry: CachedAnswer): string {
  return computeLocalCacheKey({
    text: entry.question,
    museumId: entry.museumId,
    locale: entry.locale,
    guideLevel: entry.guideLevel,
  });
}

export const useChatLocalCacheStore = create<ChatLocalCacheStore>()(
  persist(
    (set, get) => ({
      entries: {},

      lookup: (input: LookupInput): CachedAnswer | null => {
        const key = computeLocalCacheKey(input);
        const entry = get().entries[key];
        if (!entry) return null;

        // Check TTL
        if (Date.now() - entry.cachedAt > LOCAL_CACHE_TTL_MS) {
          // Expired — remove lazily
          set((state) => {
            const { [key]: _, ...rest } = state.entries;
            return { entries: rest };
          });
          return null;
        }

        return entry;
      },

      store: (entry: CachedAnswer): void => {
        const key = keyFromEntry(entry);
        set((state) => ({
          entries: evictOldest({ ...state.entries, [key]: entry }),
        }));
      },

      bulkStore: (newEntries: CachedAnswer[]): void => {
        if (newEntries.length === 0) return;
        set((state) => {
          const merged = { ...state.entries };
          for (const entry of newEntries) {
            const key = keyFromEntry(entry);
            merged[key] = entry;
          }
          return { entries: evictOldest(merged) };
        });
      },

      clearMuseum: (museumId: string): void => {
        set((state) => {
          const filtered: Record<string, CachedAnswer> = {};
          for (const [key, entry] of Object.entries(state.entries)) {
            if (entry.museumId !== museumId) {
              filtered[key] = entry;
            }
          }
          return { entries: filtered };
        });
      },

      pruneExpired: (): void => {
        const now = Date.now();
        set((state) => {
          const kept: Record<string, CachedAnswer> = {};
          for (const [key, entry] of Object.entries(state.entries)) {
            if (now - entry.cachedAt <= LOCAL_CACHE_TTL_MS) {
              kept[key] = entry;
            }
          }
          return { entries: kept };
        });
      },
    }),
    {
      name: 'musaium.chatLocalCache',
      storage: createJSONStorage(() => storage),
      version: 1,
      partialize: (state) => ({ entries: state.entries }),
    },
  ),
);
