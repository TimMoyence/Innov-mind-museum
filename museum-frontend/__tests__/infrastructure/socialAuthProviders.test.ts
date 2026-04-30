/**
 * Lightweight test for socialAuthProviders — Apple-only paths plus Google native error mapping.
 */

const mockSignInAsync = jest.fn();
const mockIsAvailableAsync = jest.fn<Promise<boolean>, []>();
const mockGoogleSignIn = jest.fn();
const mockGoogleHasPlayServices = jest.fn();

jest.mock('expo-apple-authentication', () => ({
  signInAsync: (opts: unknown) => mockSignInAsync(opts),
  isAvailableAsync: () => mockIsAvailableAsync(),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: (...args: unknown[]) => mockGoogleHasPlayServices(...args),
    signIn: (...args: unknown[]) => mockGoogleSignIn(...args),
  },
  statusCodes: {
    SIGN_IN_CANCELLED: '12501',
    IN_PROGRESS: '12502',
    PLAY_SERVICES_NOT_AVAILABLE: '12503',
    SIGN_IN_REQUIRED: '12504',
    DEVELOPER_ERROR: '10',
  },
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: {} } },
}));

import {
  signInWithApple,
  signInWithGoogle,
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

describe('signInWithGoogle native error mapping', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGoogleHasPlayServices.mockResolvedValue(true);
  });

  it('wraps a native DEVELOPER_ERROR into an AppError with code "google_developer_error"', async () => {
    const orig = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'android', writable: true });

    const nativeError = Object.assign(
      new Error(
        'DEVELOPER_ERROR: Follow troubleshooting instructions at https://react-native-google-signin.github.io/docs/troubleshooting',
      ),
      { code: '10' },
    );
    mockGoogleSignIn.mockRejectedValue(nativeError);

    await expect(signInWithGoogle()).rejects.toMatchObject({
      kind: 'SocialAuth',
      code: 'google_developer_error',
    });

    Object.defineProperty(Platform, 'OS', { value: orig, writable: true });
  });
});

// ── F3 — OIDC nonce binding ─────────────────────────────────────────
describe('signInWithApple — F3 nonce', () => {
  beforeEach(() => jest.clearAllMocks());

  it('passes the nonce through to the Apple SDK and echoes it back to the caller', async () => {
    mockSignInAsync.mockResolvedValue({ identityToken: 'apple-token' });
    const result = await signInWithApple({ nonce: 'fixed-nonce-value' });
    expect(mockSignInAsync).toHaveBeenCalledWith(
      expect.objectContaining({ nonce: 'fixed-nonce-value' }),
    );
    expect(result).toEqual({
      provider: 'apple',
      idToken: 'apple-token',
      nonce: 'fixed-nonce-value',
    });
  });

  it('omits the nonce option when none is provided (legacy callers)', async () => {
    mockSignInAsync.mockResolvedValue({ identityToken: 'apple-token' });
    const result = await signInWithApple();
    expect(mockSignInAsync).toHaveBeenCalledTimes(1);
    expect(mockSignInAsync.mock.calls[0][0]).not.toHaveProperty('nonce');
    expect(result.nonce).toBeUndefined();
  });
});

describe('signInWithGoogle — F3 nonce (deferred to Phase 2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGoogleHasPlayServices.mockResolvedValue(true);
    mockGoogleSignIn.mockResolvedValue({
      type: 'success',
      data: { idToken: 'google-token' },
    });
  });

  it('accepts a nonce option for API symmetry but does NOT forward it to the SDK (legacy GoogleSignin API has no nonce field — Phase 2 migration to GoogleOneTapSignIn)', async () => {
    const orig = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'android', writable: true });

    const result = await signInWithGoogle({ nonce: 'g-nonce-123' });
    // SDK called with no args — nonce intentionally dropped (see JSDoc).
    expect(mockGoogleSignIn).toHaveBeenCalledWith();
    // nonce intentionally undefined in result so backend skips assertion.
    expect(result).toEqual({ provider: 'google', idToken: 'google-token' });

    Object.defineProperty(Platform, 'OS', { value: orig, writable: true });
  });

  it('legacy callers without nonce option still work', async () => {
    const orig = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'android', writable: true });

    const result = await signInWithGoogle();
    expect(result.nonce).toBeUndefined();

    Object.defineProperty(Platform, 'OS', { value: orig, writable: true });
  });
});
