import { QueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import Constants from 'expo-constants';

import type { AppError } from '@/shared/types/AppError';

const STALE_TIME_DEFAULT = 5 * 60 * 1000;
const GC_TIME_DEFAULT = 24 * 60 * 60 * 1000;
const PERSIST_MAX_AGE = 24 * 60 * 60 * 1000;

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const appVersion =
  asString(Constants.expoConfig?.version) ??
  asString(Constants.expoConfig?.extra?.APP_VERSION) ??
  'dev';

/**
 * Returns `false` when the error is a terminal client-side AppError that should
 * not be retried (auth, forbidden, validation, business limits). Else keeps
 * React Query's default retry policy (server/network/timeout errors).
 */
const shouldRetry = (failureCount: number, error: unknown): boolean => {
  const code = (error as AppError | null)?.kind;
  if (
    code === 'Unauthorized' ||
    code === 'Forbidden' ||
    code === 'NotFound' ||
    code === 'Validation' ||
    code === 'DailyLimitReached' ||
    code === 'RateLimited'
  ) {
    return false;
  }
  return failureCount < 2;
};

/**
 * Global React Query client with production-tuned defaults:
 * - 5 min staleTime so returning to a screen doesn't refetch every time
 * - 24 h gcTime (and persisted cache maxAge) so the UI feels immediate at cold start
 * - refetchOnReconnect enabled so data self-heals when the device regains connectivity
 * - refetchOnWindowFocus disabled (mobile uses an explicit AppState listener)
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: STALE_TIME_DEFAULT,
      gcTime: GC_TIME_DEFAULT,
      retry: shouldRetry,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30_000),
      refetchOnReconnect: true,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
});

/**
 * AsyncStorage-backed persister for {@link queryClient}. Used by
 * `PersistQueryClientProvider` in the root layout to hydrate React Query's
 * cache across cold starts.
 */
export const queryPersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'musaium.query.cache',
  throttleTime: 1000,
});

/**
 * Cache buster — changing the app version invalidates the persisted cache.
 * Intentionally not user-scoped here: cache purging on session change is
 * handled explicitly via {@link resetPersistedCache} at logout, which is
 * synchronous with respect to AsyncStorage rather than relying on hydration
 * buster checks.
 */
export const persistBuster = `musaium-${appVersion}`;

/** Max age for persisted queries. */
export const persistMaxAge = PERSIST_MAX_AGE;

/**
 * Purges every trace of the React Query cache — both in-memory and the
 * AsyncStorage-backed persister. MUST be called at logout and on forced
 * sign-out (401) to prevent user A's data from hydrating in user B's session
 * on a shared device.
 *
 * Implementation notes:
 * - `queryClient.clear()` empties the in-memory cache but only enqueues a
 *   persist roundtrip that is throttled ({@link queryPersister} uses
 *   `throttleTime: 1000`), so the AsyncStorage key may still contain the old
 *   cache for up to 1 s after `clear()`.
 * - `queryPersister.removeClient()` deletes the AsyncStorage key immediately
 *   (returns a promise resolved once the storage write completes).
 *
 * Order matters: remove the persisted blob first so a crash mid-reset cannot
 * leave the memory cache wiped while the on-disk copy lingers and rehydrates
 * on the next cold start.
 */
export const resetPersistedCache = async (): Promise<void> => {
  try {
    await queryPersister.removeClient();
  } catch {
    // AsyncStorage failure is non-fatal: an in-memory clear still protects
    // this runtime and the persister will overwrite on the next successful
    // write.
  }
  queryClient.clear();
};
