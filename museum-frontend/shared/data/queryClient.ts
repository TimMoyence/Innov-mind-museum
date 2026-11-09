import { QueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import Constants from 'expo-constants';

import type { AppError } from '@/shared/types/AppError';
import { installOnlineManagerBridge } from '@/shared/infrastructure/connectivity/onlineManagerBridge';

installOnlineManagerBridge();

const STALE_TIME_DEFAULT = 5 * 60 * 1000;
const GC_TIME_DEFAULT = 24 * 60 * 60 * 1000;
const PERSIST_MAX_AGE = 24 * 60 * 60 * 1000;

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const appVersion =
  asString(Constants.expoConfig?.version) ??
  asString(Constants.expoConfig?.extra?.APP_VERSION) ??
  'dev';

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

const SENSITIVE_QUERY_KEY_PREFIXES = new Set<string>([
  'messages',
  'session',
  'admin',
  'auth',
  'user',
]);

export function shouldDehydrateQuery(query: {
  queryKey: readonly unknown[];
  state: { status: string };
}): boolean {
  if (query.state.status !== 'success') return false;
  const head = query.queryKey[0];
  if (typeof head !== 'string') return true;
  return !SENSITIVE_QUERY_KEY_PREFIXES.has(head);
}

export const queryPersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'musaium.query.cache',
  throttleTime: 1000,
});

export const persistBuster = `musaium-${appVersion}`;

export const persistMaxAge = PERSIST_MAX_AGE;

export const resetPersistedCache = async (): Promise<void> => {
  try {
    await queryPersister.removeClient();
  } catch {}
  queryClient.clear();
};
