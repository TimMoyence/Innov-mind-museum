import { Platform } from 'react-native';

import { storage } from '@/shared/infrastructure/storage';

let accessToken = '';

export const setAccessToken = (token: string | null | undefined): void => {
  accessToken = token ?? '';
};

export const getAccessToken = (): string => accessToken;

export const clearAccessToken = (): void => {
  accessToken = '';
};

const REFRESH_TOKEN_KEY = 'auth.refreshToken';
const ACCESS_TOKEN_KEY = 'auth.accessToken';

interface SecureStoreModule {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (
    key: string,
    value: string,
    options?: { keychainAccessible?: unknown },
  ) => Promise<void>;
  deleteItemAsync: (key: string) => Promise<void>;
  // iOS keychain accessibility constant read at the call site so the real enum
  // value is used at runtime (TD-SEC-01: device-bound, non-backup-migratable).
  WHEN_UNLOCKED_THIS_DEVICE_ONLY?: unknown;
}

const loadSecureStore = (): SecureStoreModule | null => {
  if (Platform.OS === 'web') {
    return null;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy load for test isolation
    return require('expo-secure-store') as SecureStoreModule;
  } catch {
    return null;
  }
};

const secureStore = loadSecureStore();

const secureTokenStore = (key: string) => ({
  async get(): Promise<string | null> {
    if (secureStore) {
      return secureStore.getItemAsync(key);
    }
    return storage.getItem(key);
  },
  async set(token: string): Promise<void> {
    if (secureStore) {
      // TD-SEC-01 (R1, R2): device-bound, non-backup-migratable accessibility
      // class so the JWT access/refresh tokens are never written into the
      // iCloud/iTunes encrypted backup. Reads the constant off the loaded
      // module so the real iOS enum value is used at runtime.
      await secureStore.setItemAsync(key, token, {
        keychainAccessible: secureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
      return;
    }
    await storage.setItem(key, token);
  },
  async clear(): Promise<void> {
    if (secureStore) {
      await secureStore.deleteItemAsync(key);
      return;
    }
    await storage.removeItem(key);
  },
});

const refreshTokenStore = secureTokenStore(REFRESH_TOKEN_KEY);
const accessTokenStore = secureTokenStore(ACCESS_TOKEN_KEY);

/** Persistent storage for auth credentials, using expo-secure-store on native and AsyncStorage on web. */
export const authStorage = {
  async getRefreshToken(): Promise<string | null> {
    return refreshTokenStore.get();
  },
  async setRefreshToken(token: string): Promise<void> {
    return refreshTokenStore.set(token);
  },
  async clearRefreshToken(): Promise<void> {
    return refreshTokenStore.clear();
  },
  async getPersistedAccessToken(): Promise<string | null> {
    return accessTokenStore.get();
  },
  async setPersistedAccessToken(token: string): Promise<void> {
    return accessTokenStore.set(token);
  },
  async clearPersistedAccessToken(): Promise<void> {
    return accessTokenStore.clear();
  },
};
