import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowserNamespace from 'expo-web-browser';
import { Platform } from 'react-native';

import { authService, type LoginResponse } from '@/features/auth/infrastructure/authApi';
import { resolveInitialApiBaseUrl } from '@/shared/infrastructure/apiConfig';
import { createAppError } from '@/shared/types/AppError';

type WebBrowserModule = typeof WebBrowserNamespace;

const exposesAuthSession = (mod: Partial<WebBrowserModule> | undefined): boolean =>
  typeof mod?.openAuthSessionAsync === 'function';

const loadWebBrowser = (): WebBrowserModule => {
  if (!exposesAuthSession(WebBrowserNamespace)) {
    throw createAppError({
      kind: 'SocialAuth',
      code: 'browser_unavailable',
      message: 'In-app browser is unavailable on this build',
      details: { cause: 'expo-web-browser exports incomplete' },
    });
  }
  return WebBrowserNamespace;
};

const MOBILE_DEEPLINK_SUCCESS = 'musaium://auth/google/callback';
const MOBILE_DEEPLINK_PREFIX = 'musaium://';

interface AppleAuthResult {
  provider: 'apple';
  idToken: string;
  nonce?: string;
}

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

function parseCallbackUrl(url: string): CallbackParse {
  const queryIndex = url.indexOf('?');
  if (!url.startsWith(MOBILE_DEEPLINK_PREFIX) || queryIndex === -1) {
    return { kind: 'error', reason: 'invalid_callback_url' };
  }
  const afterQuery = url.slice(queryIndex + 1);
  const fragmentIndex = afterQuery.indexOf('#');
  const queryString = fragmentIndex === -1 ? afterQuery : afterQuery.slice(0, fragmentIndex);
  const search = new URLSearchParams(queryString);
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

export const isAppleSignInAvailable = async (): Promise<boolean> => {
  if (Platform.OS !== 'ios') {
    return false;
  }
  return AppleAuthentication.isAvailableAsync();
};
