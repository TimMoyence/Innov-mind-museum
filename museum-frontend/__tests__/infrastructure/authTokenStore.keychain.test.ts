/**
 * TD-SEC-01 (R1, R2) — native keychain accessibility hardening.
 *
 * The companion `authTokenStore.test.ts` freezes `Platform.OS='web'`, so
 * `loadSecureStore()` returns null there and SecureStore is never exercised.
 * This file freezes `Platform.OS='ios'` and mocks `expo-secure-store` so the
 * native write path runs, then asserts every token write passes
 * `{ keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }`.
 *
 * RED: current `authTokenStore.ts` calls `setItemAsync(key, token)` with NO
 * options object, so these assertions FAIL until the factory is hardened.
 */

// Sentinel for the iOS keychain-accessibility constant. The production code
// is expected to read this off the loaded module
// (`secureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY`) so the test asserts against
// the exact same reference the runtime uses.
const WHEN_UNLOCKED_THIS_DEVICE_ONLY = 'mock-when-unlocked-this-device-only';

const mockSetItemAsync = jest.fn<Promise<void>, [string, string, unknown?]>(() =>
  Promise.resolve(),
);
const mockGetItemAsync = jest.fn<Promise<string | null>, [string]>(() => Promise.resolve(null));
const mockDeleteItemAsync = jest.fn<Promise<void>, [string]>(() => Promise.resolve());

jest.mock('expo-secure-store', () => ({
  __esModule: true,
  WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  setItemAsync: (...args: [string, string, unknown?]) => mockSetItemAsync(...args),
  getItemAsync: (...args: [string]) => mockGetItemAsync(...args),
  deleteItemAsync: (...args: [string]) => mockDeleteItemAsync(...args),
}));

// Force native (iOS) so loadSecureStore() requires expo-secure-store instead
// of falling back to AsyncStorage.
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

import { authStorage } from '@/features/auth/infrastructure/authTokenStore';

const ACCESS_TOKEN_KEY = 'auth.accessToken';
const REFRESH_TOKEN_KEY = 'auth.refreshToken';

describe('authTokenStore — native keychain accessibility (TD-SEC-01)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('persists the access token with keychainAccessible WHEN_UNLOCKED_THIS_DEVICE_ONLY (R1)', async () => {
    await authStorage.setPersistedAccessToken('access-token-value');

    expect(mockSetItemAsync).toHaveBeenCalledWith(ACCESS_TOKEN_KEY, 'access-token-value', {
      keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  });

  it('persists the refresh token with keychainAccessible WHEN_UNLOCKED_THIS_DEVICE_ONLY (R2)', async () => {
    await authStorage.setRefreshToken('refresh-token-value');

    expect(mockSetItemAsync).toHaveBeenCalledWith(REFRESH_TOKEN_KEY, 'refresh-token-value', {
      keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  });
});
