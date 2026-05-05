import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import { storage } from '@/shared/infrastructure/storage';

import { computeLocalCacheKey } from './computeLocalCacheKey';

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
  clearAll: () => Promise<void>;
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
    .flatMap((k) => {
      const entry = entries[k];
      return entry ? [{ key: k, cachedAt: entry.cachedAt }] : [];
    })
    .sort((a, b) => b.cachedAt - a.cachedAt);

  const kept = sorted.slice(0, MAX_LOCAL_ENTRIES);
  const result: Record<string, CachedAnswer> = {};
  for (const { key } of kept) {
    const entry = entries[key];
    if (entry) result[key] = entry;
  }
  return result;
}

/**
 * Builds a cache key from a CachedAnswer (for store/bulkStore operations).
 *
 * Why: this local store backs the *prefetched FAQ* surface — entries are by
 * construction generic (turn 1, no attachment, no geo). Pinning the
 * generic flags here keeps the frontend in the global namespace and
 * preserves cross-user hit-rate for the safe subset.
 */
function keyFromEntry(entry: CachedAnswer): string {
  return computeLocalCacheKey({
    text: entry.question,
    museumId: entry.museumId,
    locale: entry.locale,
    guideLevel: entry.guideLevel,
    hasHistory: false,
    hasAttachment: false,
    hasGeo: false,
  });
}

export const useChatLocalCacheStore = create<ChatLocalCacheStore>()(
  persist(
    (set, get) => ({
      entries: {},

      lookup: (input: LookupInput): CachedAnswer | null => {
        // Local store mirrors the backend "global" namespace by design —
        // it only backs prefetched FAQ-style answers. Pin the classifier
        // flags so the key matches what the backend wrote under
        // `chat:llm:global:...`. See `keyFromEntry()` above.
        const key = computeLocalCacheKey({
          ...input,
          hasHistory: false,
          hasAttachment: false,
          hasGeo: false,
        });
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

      clearAll: async (): Promise<void> => {
        // In-memory wipe first so a disk failure below still leaves a clean
        // cache in this runtime. Persistence errors are swallowed — disk
        // writes are best-effort; tests exercise the crash path by mocking
        // the whole clearAll to reject.
        set({ entries: {} });
        try {
          useChatLocalCacheStore.persist.clearStorage();
        } catch {
          // swallow
        }
        // Async signature preserved so callers (AuthContext Promise.allSettled)
        // can treat this uniformly alongside the other cleanup fns.
        return Promise.resolve();
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
