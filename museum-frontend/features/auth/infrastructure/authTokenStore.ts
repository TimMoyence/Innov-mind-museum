import { Platform } from 'react-native';

import { storage } from '@/shared/infrastructure/storage';

// ── In-memory access token ──────────────────────────────────────────────────

let accessToken = '';

/**
 * Stores the access token in memory.
 * @param token - JWT access token, or a nullish value to clear it.
 */
export const setAccessToken = (token: string | null | undefined): void => {
  accessToken = token ?? '';
};

/** Returns the current in-memory access token (empty string when none is set). */
export const getAccessToken = (): string => accessToken;

/** Clears the in-memory access token. */
export const clearAccessToken = (): void => {
  accessToken = '';
};

// ── Persistent refresh token (SecureStore on native, AsyncStorage on web) ───

const REFRESH_TOKEN_KEY = 'auth.refreshToken';

interface SecureStoreModule {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
  deleteItemAsync: (key: string) => Promise<void>;
}

const loadSecureStore = (): SecureStoreModule | null => {
  if (Platform.OS === 'web') {
    return null;
  }

  try {
    // Runtime optional to avoid breaking local CI/typecheck when the package is not installed yet.
    // Install `expo-secure-store` before production mobile builds.
     
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy load for test isolation
    return require('expo-secure-store') as SecureStoreModule;
  } catch {
    return null;
  }
};

const secureStore = loadSecureStore();

const refreshTokenStore = {
  async get(): Promise<string | null> {
    if (secureStore) {
      return secureStore.getItemAsync(REFRESH_TOKEN_KEY);
    }
    return storage.getItem(REFRESH_TOKEN_KEY);
  },
  async set(token: string): Promise<void> {
    if (secureStore) {
      await secureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
      return;
    }
    await storage.setItem(REFRESH_TOKEN_KEY, token);
  },
  async clear(): Promise<void> {
    if (secureStore) {
      await secureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
      return;
    }
    await storage.removeItem(REFRESH_TOKEN_KEY);
  },
};

/** Persistent storage for auth credentials, using expo-secure-store on native and AsyncStorage on web. */
export const authStorage = {
  /** Retrieves the stored refresh token, or `null` if none exists. */
  async getRefreshToken(): Promise<string | null> {
    return refreshTokenStore.get();
  },
  /**
   * Persists a refresh token to secure storage.
   * @param token - The refresh token to store.
   */
  async setRefreshToken(token: string): Promise<void> {
    return refreshTokenStore.set(token);
  },
  /** Removes the stored refresh token. */
  async clearRefreshToken(): Promise<void> {
    return refreshTokenStore.clear();
  },
};
