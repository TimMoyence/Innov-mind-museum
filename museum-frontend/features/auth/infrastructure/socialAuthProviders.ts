import * as AppleAuthentication from 'expo-apple-authentication';
import type * as WebBrowserNamespace from 'expo-web-browser';
import { Platform } from 'react-native';

import { authService, type LoginResponse } from '@/features/auth/infrastructure/authApi';
import { resolveInitialApiBaseUrl } from '@/shared/infrastructure/apiConfig';
import { createAppError } from '@/shared/types/AppError';

type WebBrowserModule = typeof WebBrowserNamespace;

// expo-web-browser is loaded lazily so a missing native module (e.g. iOS
// Pods/ out of sync with package.json after a config-plugin change) cannot
// crash the JS bundle at module-load time. Combined with the global JS error
// handler in app/_layout.tsx, an unlinked native module degrades to a
// SocialAuth AppError surfaced in the UI instead of an app abort (SIGABRT
// via RCTFatal). Caught by test mocks via `jest.mock('expo-web-browser', …)`.
const loadWebBrowser = (): WebBrowserModule => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- defensive runtime require; static import would throw at module-load when the ExpoWebBrowser native module is not linked into the iOS/Android binary.
    const mod = require('expo-web-browser') as Partial<WebBrowserModule> | undefined;
    if (!mod || typeof mod.openAuthSessionAsync !== 'function') {
      throw new Error('expo-web-browser exports incomplete');
    }
    return mod as WebBrowserModule;
  } catch (cause) {
    throw createAppError({
      kind: 'SocialAuth',
      code: 'browser_unavailable',
      message: 'In-app browser is unavailable on this build',
      details: { cause: cause instanceof Error ? cause.message : String(cause) },
    });
  }
};

/**
 * F11-mobile (2026-05) — deeplink scheme the in-app OAuth browser must land on
 * for the Google flow. Hardcoded server-side too, so the redirect is not
 * client-controlled (no open-redirect surface).
 */
const MOBILE_DEEPLINK_SUCCESS = 'musaium://auth/google/callback';
const MOBILE_DEEPLINK_PREFIX = 'musaium://';

/** Result of a successful Apple sign-in (direct ID-token POST flow). */
interface AppleAuthResult {
  provider: 'apple';
  idToken: string;
  /** Raw nonce echoed for backend verification — `undefined` only on legacy callers. */
  nonce?: string;
}

/**
 * Initiates the Apple Sign-In flow and returns the identity token.
 *
 * @param options.nonce - Optional OIDC nonce (F3). Apple's SDK hashes it with
 *   SHA-256 client-side and embeds the digest as the `nonce` claim of the
 *   returned ID token. Pass it through to `authService.socialLogin` so the
 *   backend can verify a single-use binding.
 */
export const signInWithApple = async (
  options: { nonce?: string } = {},
): Promise<AppleAuthResult> => {
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
    ...(options.nonce ? { nonce: options.nonce } : {}),
  });

  if (!credential.identityToken) {
    throw createAppError({
      kind: 'SocialAuth',
      code: 'apple_no_identity_token',
      message: 'Apple Sign-In failed: no identity token',
    });
  }

  return {
    provider: 'apple',
    idToken: credential.identityToken,
    nonce: options.nonce,
  };
};

/**
 * F11-mobile (2026-05) — Google sign-in via the server-mediated redirect flow.
 *
 * The previous direct ID-token POST through @react-native-google-signin v16
 * was broken: that SDK does not support OIDC nonce binding (it is a paid
 * feature of the universal-sign-in.com fork), and the legacy code shipped a
 * client-issued nonce that the backend then rejected as INVALID_NONCE.
 *
 * Replacement flow:
 *   1. Build `${apiBaseUrl}/api/auth/google/initiate?platform=mobile`.
 *   2. Open the URL via `WebBrowser.openAuthSessionAsync` so the in-app
 *      browser auto-closes when the redirect lands on `musaium://`.
 *   3. The backend signs a state JWT with platform=mobile, issues a nonce,
 *      sends the user to Google. After Google redirects back, the backend
 *      consumes the nonce + ID token, mints an OTC keyed against the issued
 *      session, and 302s to `musaium://auth/google/callback?code=<otc>`.
 *   4. We parse the OTC from the deeplink URL and exchange it for the actual
 *      session via POST /api/auth/social-redeem.
 *
 * The OTC is single-use, 60s TTL, base64url. Even if the deeplink leaks (logs,
 * screenshots, app-switch peek) an attacker has at most a handful of seconds
 * before the legitimate client redeems it.
 *
 * @returns The authenticated session payload, identical to /login.
 * @throws An {@link AppError} `kind: 'SocialAuth'` for cancellation
 *   (`google_cancelled`) or any backend failure (`google_unknown`).
 */
export const signInWithGoogle = async (): Promise<LoginResponse> => {
  const WebBrowser = loadWebBrowser();
  const baseUrl = resolveInitialApiBaseUrl().replace(/\/$/, '');
  const authUrl = `${baseUrl}/api/auth/google/initiate?platform=mobile`;

  const result = await WebBrowser.openAuthSessionAsync(authUrl, MOBILE_DEEPLINK_SUCCESS);

  if (result.type !== 'success' || !result.url) {
    throw createAppError({
      kind: 'SocialAuth',
      code: 'google_cancelled',
      message: 'Google Sign-In was cancelled',
    });
  }

  const callback = parseCallbackUrl(result.url);
  if (callback.kind === 'error') {
    throw createAppError({
      kind: 'SocialAuth',
      code: 'google_unknown',
      message: `Google Sign-In failed: ${callback.reason}`,
    });
  }

  return await authService.redeemSocialCode(callback.code);
};

type CallbackParse = { kind: 'ok'; code: string } | { kind: 'error'; reason: string };

/**
 * Parses a `musaium://...` deeplink URL into either an OTC code (success path)
 * or an error reason (failure path). Anything that doesn't carry a code is
 * treated as failure to avoid silently swallowing edge cases.
 */
function parseCallbackUrl(url: string): CallbackParse {
  // The success path is `musaium://auth/google/callback?code=<otc>` and the
  // failure path is `musaium://auth/google/error?reason=<reason>`. Both share
  // the `musaium://` prefix; we read the query regardless of host so a
  // backend-side path tweak does not silently break the parser.
  const queryIndex = url.indexOf('?');
  if (!url.startsWith(MOBILE_DEEPLINK_PREFIX) || queryIndex === -1) {
    return { kind: 'error', reason: 'invalid_callback_url' };
  }
  const search = new URLSearchParams(url.slice(queryIndex + 1));
  const reason = search.get('reason') ?? search.get('error');
  if (reason) {
    return { kind: 'error', reason };
  }
  const code = search.get('code');
  if (!code) {
    return { kind: 'error', reason: 'missing_code' };
  }
  return { kind: 'ok', code };
}

/**
 * Checks whether Apple Sign-In is available on the current device.
 * @returns `true` on iOS devices that support Apple Authentication, `false` otherwise.
 */
export const isAppleSignInAvailable = async (): Promise<boolean> => {
  if (Platform.OS !== 'ios') {
    return false;
  }
  return AppleAuthentication.isAvailableAsync();
};
