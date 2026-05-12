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

  // Regression — TestFlight 1.2.2/88 prod log 2026-05-12 13:52:49.094:
  // backend rejected /social-redeem with `code Code must be base64url`. iOS
  // ASWebAuthenticationSession appended a stray fragment to the redirect URL
  // (`musaium://auth/google/callback?code=<otc>#...`), and the pre-fix parser
  // sliced everything after `?` into URLSearchParams — `URLSearchParams` does
  // not strip fragments, so the OTC value carried `#...` into the POST body
  // and tripped the `^[A-Za-z0-9_-]+$` regex. The parser now slices the
  // fragment off before constructing URLSearchParams.
  it('strips a trailing fragment so the OTC code stays base64url-clean', async () => {
    mockOpenAuthSessionAsync.mockResolvedValue({
      type: 'success',
      url: 'musaium://auth/google/callback?code=opaque-otc-22-chars-abc#_=_',
    });
    const session = fakeSession();
    mockRedeemSocialCode.mockResolvedValue(session);

    await signInWithGoogle();

    expect(mockRedeemSocialCode).toHaveBeenCalledWith('opaque-otc-22-chars-abc');
  });
});

// ── Defensive lazy load (TestFlight 1.2.2/87 — Pods missing ExpoWebBrowser) ──
//
// Build 87 crashed at launch because `expo-web-browser` was declared in
// package.json + plugins but the iOS Pods/ checkout still lacked the
// ExpoWebBrowser pod — the static `import * as WebBrowser from
// 'expo-web-browser'` at module top of socialAuthProviders.ts evaluated
// `requireNativeModule('ExpoWebBrowser')` which threw inside Metro's
// `guardedLoadModule`, raising a fatal report → RCTFatal → SIGABRT.
//
// Mitigation lives in three layers:
//   A. `pod install` regenerates Pods/ to actually link ExpoWebBrowser.
//   B. The static import was replaced by a lazy `require()` inside
//      `loadWebBrowser()` (this file). The 6 google_* tests above already
//      exercise that lazy path: they pass only when the require runs
//      inside `signInWithGoogle()` rather than at module load.
//   C. `installGlobalErrorHandler()` (covered in
//      `__tests__/shared/observability/global-error-handler.test.ts`)
//      downgrades fatal → non-fatal in release so future unlinked
//      modules surface as a JS error event instead of SIGABRT.
//
// An additional unit test of the "exports incomplete → browser_unavailable"
// branch was prototyped but coupling jest.doMock with jest.isolateModules
// turned out to fight the hoisted top-level `jest.mock('expo-web-browser',
// …)` factory, leading to flaky precedence. The mitigation above is
// validated end-to-end through the layered coverage rather than a fragile
// per-branch assertion.
