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

import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  clearBiometricPreference,
  getBiometricEnabled,
  setBiometricEnabled,
} from '@/features/auth/infrastructure/biometricStore';

const BIOMETRIC_KEY = 'auth.biometricEnabled';

describe('biometricStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('clearBiometricPreference', () => {
    it('removes the biometric flag from storage', async () => {
      await setBiometricEnabled(true);
      expect(await getBiometricEnabled()).toBe(true);

      await clearBiometricPreference();

      expect(AsyncStorage.removeItem).toHaveBeenCalledWith(BIOMETRIC_KEY);
      expect(await getBiometricEnabled()).toBe(false);
    });

    it('resolves even when removeItem rejects', async () => {
      (AsyncStorage.removeItem as jest.Mock).mockRejectedValueOnce(new Error('io failure'));

      await expect(clearBiometricPreference()).resolves.toBeUndefined();
    });

    it('is idempotent when no preference is set', async () => {
      await expect(clearBiometricPreference()).resolves.toBeUndefined();
      expect(AsyncStorage.removeItem).toHaveBeenCalledWith(BIOMETRIC_KEY);
    });
  });
});
