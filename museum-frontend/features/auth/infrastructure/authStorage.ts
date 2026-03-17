import { Platform } from 'react-native';

import { storage } from '@/shared/infrastructure/storage';

const REFRESH_TOKEN_KEY = 'auth.refreshToken';

type SecureStoreModule = {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
  deleteItemAsync: (key: string) => Promise<void>;
};

const loadSecureStore = (): SecureStoreModule | null => {
  if (Platform.OS === 'web') {
    return null;
  }

  try {
    // Runtime optional to avoid breaking local CI/typecheck when the package is not installed yet.
    // Install `expo-secure-store` before production mobile builds.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
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

};
