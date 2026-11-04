import { Platform } from 'react-native';

import { storage } from '@/shared/infrastructure/storage';
import { USER_PROFILE_STORAGE_KEY } from '@/features/settings/infrastructure/userProfileStore';

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

const INSTALL_MARKER_KEY = 'auth.installMarker';

/**
 * iOS keeps the Keychain when the app is uninstalled, so a previous install's
 * refresh token would reopen its session. App data (AsyncStorage) is wiped with
 * the install: no marker and no profile means a brand-new install, whose
 * Keychain tokens belong to someone else. An install that predates the marker
 * has a profile and keeps its session. Runs once per install and never throws.
 */
export const purgeStaleCredentialsOnFreshInstall = async (): Promise<void> => {
  try {
    if ((await storage.getItem(INSTALL_MARKER_KEY)) !== null) {
      return;
    }
    if ((await storage.getItem(USER_PROFILE_STORAGE_KEY)) === null) {
      await Promise.all([
        refreshTokenStore.clear().catch(() => undefined),
        accessTokenStore.clear().catch(() => undefined),
      ]);
    }
    await storage.setItem(INSTALL_MARKER_KEY, '1');
  } catch {
    return;
  }
};

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
