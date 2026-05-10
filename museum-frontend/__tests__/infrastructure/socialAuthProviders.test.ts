/**
 * F11-mobile (2026-05) — socialAuthProviders tests.
 *
 * Apple keeps the direct ID-token POST flow (signInAsync nonce-binds via SHA-256
 * client-side). Google migrated off the broken @react-native-google-signin nonce
 * flow to the server-mediated /google/initiate redirect — the in-app browser
 * lands on `musaium://auth/google/callback?code=<otc>` and the OTC is redeemed
 * via POST /api/auth/social-redeem.
 */

const mockSignInAsync = jest.fn();
const mockIsAvailableAsync = jest.fn<Promise<boolean>, []>();
const mockOpenAuthSessionAsync = jest.fn();
const mockRedeemSocialCode = jest.fn();

jest.mock('expo-apple-authentication', () => ({
  signInAsync: (opts: unknown) => mockSignInAsync(opts),
  isAvailableAsync: () => mockIsAvailableAsync(),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));

jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: (...args: unknown[]) => mockOpenAuthSessionAsync(...args),
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        EXPO_PUBLIC_API_BASE_URL: 'https://api.musaium.test',
      },
    },
  },
}));

jest.mock('@/shared/infrastructure/apiConfig', () => ({
  resolveInitialApiBaseUrl: () => 'https://api.musaium.test',
}));

jest.mock('@/features/auth/infrastructure/authApi', () => ({
  authService: {
    redeemSocialCode: (...args: unknown[]) => mockRedeemSocialCode(...args),
  },
}));

import {
  signInWithApple,
  signInWithGoogle,
  isAppleSignInAvailable,
} from '@/features/auth/infrastructure/socialAuthProviders';
import { Platform } from 'react-native';

const fakeSession = () => ({
  accessToken: 'access-tok',
  refreshToken: 'refresh-tok',
  expiresIn: 900,
  refreshExpiresIn: 604_800,
  user: {
    id: 1,
    email: 'mobile@example.com',
    role: 'visitor' as const,
    onboardingCompleted: false,
  },
});

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

// ── F3 — OIDC nonce binding (Apple still binds client-side) ───────────────
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

// ── F11-mobile — Google server-mediated flow ─────────────────────────────
describe('signInWithGoogle — F11-mobile web flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('opens the backend /google/initiate URL with platform=mobile and redeems the OTC', async () => {
    mockOpenAuthSessionAsync.mockResolvedValue({
      type: 'success',
      url: 'musaium://auth/google/callback?code=opaque-otc-22-chars-abc',
    });
    const session = fakeSession();
    mockRedeemSocialCode.mockResolvedValue(session);

    const result = await signInWithGoogle();

    expect(mockOpenAuthSessionAsync).toHaveBeenCalledWith(
      'https://api.musaium.test/api/auth/google/initiate?platform=mobile',
      'musaium://auth/google/callback',
    );
    expect(mockRedeemSocialCode).toHaveBeenCalledWith('opaque-otc-22-chars-abc');
    expect(result).toEqual(session);
  });

  it('throws google_cancelled when the user dismisses the in-app browser', async () => {
    mockOpenAuthSessionAsync.mockResolvedValue({ type: 'cancel' });

    await expect(signInWithGoogle()).rejects.toMatchObject({
      kind: 'SocialAuth',
      code: 'google_cancelled',
    });
    expect(mockRedeemSocialCode).not.toHaveBeenCalled();
  });

  it('throws google_cancelled when the in-app browser is dismissed without success type', async () => {
    mockOpenAuthSessionAsync.mockResolvedValue({ type: 'dismiss' });

    await expect(signInWithGoogle()).rejects.toMatchObject({
      kind: 'SocialAuth',
      code: 'google_cancelled',
    });
  });

  it('throws google_unknown when the deeplink carries reason=login_failed', async () => {
    mockOpenAuthSessionAsync.mockResolvedValue({
      type: 'success',
      url: 'musaium://auth/google/error?reason=login_failed',
    });

    await expect(signInWithGoogle()).rejects.toMatchObject({
      kind: 'SocialAuth',
      code: 'google_unknown',
    });
    expect(mockRedeemSocialCode).not.toHaveBeenCalled();
  });

  it('throws google_unknown when the deeplink success URL has no code parameter', async () => {
    mockOpenAuthSessionAsync.mockResolvedValue({
      type: 'success',
      url: 'musaium://auth/google/callback',
    });

    await expect(signInWithGoogle()).rejects.toMatchObject({
      kind: 'SocialAuth',
      code: 'google_unknown',
    });
  });
});
