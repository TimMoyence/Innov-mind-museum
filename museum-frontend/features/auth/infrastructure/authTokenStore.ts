import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

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

const secureStore = Platform.OS === 'web' ? null : SecureStore;

const secureTokenStore = (key: string) => ({
  async get(): Promise<string | null> {
    if (secureStore) {
      return secureStore.getItemAsync(key);
    }
    return storage.getItem(key);
  },
  async set(token: string): Promise<void> {
    if (secureStore) {
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
