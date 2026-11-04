const mockDeleteItemAsync = jest.fn<Promise<void>, [string]>(() => Promise.resolve());

jest.mock('expo-secure-store', () => ({
  __esModule: true,
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'when-unlocked-this-device-only',
  setItemAsync: jest.fn(() => Promise.resolve()),
  getItemAsync: jest.fn(() => Promise.resolve('refresh-token-from-a-previous-install')),
  deleteItemAsync: (...args: [string]) => mockDeleteItemAsync(...args),
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

const mockAppData = new Map<string, string>();
const mockStorageGetItem = jest.fn((key: string) => Promise.resolve(mockAppData.get(key) ?? null));
jest.mock('@/shared/infrastructure/storage', () => ({
  storage: {
    getItem: (key: string) => mockStorageGetItem(key),
    setItem: (key: string, value: string) => {
      mockAppData.set(key, value);
      return Promise.resolve();
    },
    removeItem: (key: string) => {
      mockAppData.delete(key);
      return Promise.resolve();
    },
  },
}));

import { purgeStaleCredentialsOnFreshInstall } from '@/features/auth/infrastructure/authTokenStore';

const ACCESS_TOKEN_KEY = 'auth.accessToken';
const REFRESH_TOKEN_KEY = 'auth.refreshToken';
const USER_PROFILE_KEY = 'musaium.userProfile';

describe('purgeStaleCredentialsOnFreshInstall — iOS keeps the Keychain across reinstalls', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAppData.clear();
  });

  it('drops the previous install tokens when the app data is brand new', async () => {
    await purgeStaleCredentialsOnFreshInstall();

    expect(mockDeleteItemAsync).toHaveBeenCalledWith(REFRESH_TOKEN_KEY);
    expect(mockDeleteItemAsync).toHaveBeenCalledWith(ACCESS_TOKEN_KEY);
  });

  it('keeps the session of an install that predates the check', async () => {
    mockAppData.set(USER_PROFILE_KEY, '{"state":{}}');

    await purgeStaleCredentialsOnFreshInstall();

    expect(mockDeleteItemAsync).not.toHaveBeenCalled();
  });

  it('runs once per install', async () => {
    await purgeStaleCredentialsOnFreshInstall();
    mockDeleteItemAsync.mockClear();

    await purgeStaleCredentialsOnFreshInstall();

    expect(mockDeleteItemAsync).not.toHaveBeenCalled();
  });

  it('does not loop on a Keychain delete failure: the next launch keeps the session', async () => {
    mockDeleteItemAsync.mockRejectedValueOnce(new Error('keychain locked'));

    await expect(purgeStaleCredentialsOnFreshInstall()).resolves.toBeUndefined();
    mockDeleteItemAsync.mockClear();
    await purgeStaleCredentialsOnFreshInstall();

    expect(mockDeleteItemAsync).not.toHaveBeenCalled();
  });

  it('never signs anyone out when the app data cannot be read', async () => {
    mockStorageGetItem.mockRejectedValueOnce(new Error('storage unavailable'));

    await expect(purgeStaleCredentialsOnFreshInstall()).resolves.toBeUndefined();

    expect(mockDeleteItemAsync).not.toHaveBeenCalled();
  });
});
