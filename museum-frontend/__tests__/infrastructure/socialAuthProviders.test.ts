/**
 * Lightweight test for socialAuthProviders — Apple-only paths.
 * Google sign-in has complex native module state and is excluded from Jest coverage.
 */

const mockSignInAsync = jest.fn();
const mockIsAvailableAsync = jest.fn<Promise<boolean>, []>();

jest.mock('expo-apple-authentication', () => ({
  signInAsync: (opts: unknown) => mockSignInAsync(opts),
  isAvailableAsync: () => mockIsAvailableAsync(),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(),
    signIn: jest.fn(),
  },
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: {} } },
}));

import {
  signInWithApple,
  isAppleSignInAvailable,
} from '@/features/auth/infrastructure/socialAuthProviders';
import { Platform } from 'react-native';

describe('signInWithApple', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns apple provider and idToken on success', async () => {
    mockSignInAsync.mockResolvedValue({ identityToken: 'token-123' });
    const result = await signInWithApple();
    expect(result).toEqual({ provider: 'apple', idToken: 'token-123' });
  });

  it('throws when identityToken is null', async () => {
    mockSignInAsync.mockResolvedValue({ identityToken: null });
    await expect(signInWithApple()).rejects.toThrow('no identity token');
  });
});

describe('isAppleSignInAvailable', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns false on Android', async () => {
    const orig = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'android', writable: true });
    expect(await isAppleSignInAvailable()).toBe(false);
    Object.defineProperty(Platform, 'OS', { value: orig, writable: true });
  });

  it('delegates to expo on iOS', async () => {
    const orig = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'ios', writable: true });
    mockIsAvailableAsync.mockResolvedValue(true);
    expect(await isAppleSignInAvailable()).toBe(true);
    Object.defineProperty(Platform, 'OS', { value: orig, writable: true });
  });
});
