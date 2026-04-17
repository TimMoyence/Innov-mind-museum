jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
      setItem: jest.fn((key: string, value: string) => {
        store.set(key, value);
        return Promise.resolve();
      }),
      removeItem: jest.fn((key: string) => {
        store.delete(key);
        return Promise.resolve();
      }),
    },
  };
});

// Force web platform so SecureStore is not loaded (uses AsyncStorage fallback)
jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

import {
  setAccessToken,
  getAccessToken,
  clearAccessToken,
  authStorage,
} from '@/features/auth/infrastructure/authTokenStore';

describe('authTokenStore', () => {
  describe('in-memory access token', () => {
    afterEach(() => {
      clearAccessToken();
    });

    it('setAccessToken / getAccessToken round trip', () => {
      setAccessToken('jwt-abc-123');
      expect(getAccessToken()).toBe('jwt-abc-123');
    });

    it('clearAccessToken sets token to empty string', () => {
      setAccessToken('jwt-abc-123');
      clearAccessToken();
      expect(getAccessToken()).toBe('');
    });

    it('setAccessToken with null clears the token', () => {
      setAccessToken('jwt-abc-123');
      setAccessToken(null);
      expect(getAccessToken()).toBe('');
    });

    it('setAccessToken with undefined clears the token', () => {
      setAccessToken('jwt-abc-123');
      setAccessToken(undefined);
      expect(getAccessToken()).toBe('');
    });
  });

  describe('persistent refresh token (web / AsyncStorage)', () => {
    it('setRefreshToken persists via AsyncStorage', async () => {
      await authStorage.setRefreshToken('refresh-abc');
      const stored = await authStorage.getRefreshToken();
      expect(stored).toBe('refresh-abc');
    });

    it('getRefreshToken returns null when nothing stored', async () => {
      await authStorage.clearRefreshToken();
      const result = await authStorage.getRefreshToken();
      expect(result).toBeNull();
    });

    it('clearRefreshToken removes stored value', async () => {
      await authStorage.setRefreshToken('refresh-xyz');
      await authStorage.clearRefreshToken();
      const result = await authStorage.getRefreshToken();
      expect(result).toBeNull();
    });
  });

  describe('persistent access token (web / AsyncStorage)', () => {
    it('setPersistedAccessToken persists via AsyncStorage', async () => {
      await authStorage.setPersistedAccessToken('access-abc');
      const stored = await authStorage.getPersistedAccessToken();
      expect(stored).toBe('access-abc');
    });

    it('getPersistedAccessToken returns null when nothing stored', async () => {
      await authStorage.clearPersistedAccessToken();
      const result = await authStorage.getPersistedAccessToken();
      expect(result).toBeNull();
    });

    it('clearPersistedAccessToken removes stored value', async () => {
      await authStorage.setPersistedAccessToken('access-xyz');
      await authStorage.clearPersistedAccessToken();
      const result = await authStorage.getPersistedAccessToken();
      expect(result).toBeNull();
    });

    it('persisted access and refresh tokens use distinct keys', async () => {
      await authStorage.setPersistedAccessToken('only-access');
      await authStorage.setRefreshToken('only-refresh');

      expect(await authStorage.getPersistedAccessToken()).toBe('only-access');
      expect(await authStorage.getRefreshToken()).toBe('only-refresh');

      await authStorage.clearPersistedAccessToken();
      expect(await authStorage.getPersistedAccessToken()).toBeNull();
      expect(await authStorage.getRefreshToken()).toBe('only-refresh');
    });
  });
});
