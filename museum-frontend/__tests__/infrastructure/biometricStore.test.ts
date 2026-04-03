jest.mock('@react-native-async-storage/async-storage', () => {
  const store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn((key: string) => Promise.resolve(store[key] ?? null)),
      setItem: jest.fn((key: string, value: string) => {
        store[key] = value;
        return Promise.resolve();
      }),
      removeItem: jest.fn((key: string) => {
        delete store[key];
        return Promise.resolve();
      }),
    },
  };
});

import {
  getBiometricEnabled,
  setBiometricEnabled,
} from '@/features/auth/infrastructure/biometricStore';
import AsyncStorage from '@react-native-async-storage/async-storage';

describe('biometricStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear the in-memory store between tests
    (AsyncStorage.removeItem as jest.Mock)('auth.biometricEnabled');
  });

  it('defaults to false when no value is stored', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null);
    const result = await getBiometricEnabled();
    expect(result).toBe(false);
  });

  it('returns true after setting enabled to true', async () => {
    await setBiometricEnabled(true);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('auth.biometricEnabled', 'true');

    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('true');
    const result = await getBiometricEnabled();
    expect(result).toBe(true);
  });

  it('returns false after setting enabled to false', async () => {
    await setBiometricEnabled(false);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('auth.biometricEnabled', 'false');

    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('false');
    const result = await getBiometricEnabled();
    expect(result).toBe(false);
  });
});
