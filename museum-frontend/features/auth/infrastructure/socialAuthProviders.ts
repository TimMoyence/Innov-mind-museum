import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import Constants from 'expo-constants';
import { Linking, Platform } from 'react-native';

import { createAppError } from '@/shared/types/AppError';

/** Supported social identity providers for sign-in. */
type SocialProvider = 'apple' | 'google';

/** Result of a successful social sign-in containing the provider name and its identity token. */
interface SocialAuthResult {
  provider: SocialProvider;
  idToken: string;
}

const DEFAULT_GOOGLE_WEB_CLIENT_ID =
  '498339023976-bjbain2ir2t9q4pu9lsmmk8ni7t96dd7.apps.googleusercontent.com';
const DEFAULT_GOOGLE_IOS_CLIENT_ID =
  '498339023976-8r199kpqbqmhb7mdf45ostg3sutqeng2.apps.googleusercontent.com';
const DEFAULT_GOOGLE_IOS_URL_SCHEME =
  'com.googleusercontent.apps.498339023976-8r199kpqbqmhb7mdf45ostg3sutqeng2';
const GOOGLE_IOS_CLIENT_ID_SUFFIX = '.apps.googleusercontent.com';

const asNonEmptyString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length ? normalized : null;
};

const deriveGoogleIosUrlScheme = (googleIosClientId: string): string | null => {
  if (!googleIosClientId.endsWith(GOOGLE_IOS_CLIENT_ID_SUFFIX)) {
    return null;
  }

  const clientIdPrefix = googleIosClientId.slice(0, -GOOGLE_IOS_CLIENT_ID_SUFFIX.length);
  if (!clientIdPrefix.length) {
    return null;
  }

  return `com.googleusercontent.apps.${clientIdPrefix}`;
};

const googleWebClientId =
  asNonEmptyString(Constants.expoConfig?.extra?.GOOGLE_WEB_CLIENT_ID) ??
  DEFAULT_GOOGLE_WEB_CLIENT_ID;
const googleIosClientId =
  asNonEmptyString(Constants.expoConfig?.extra?.GOOGLE_IOS_CLIENT_ID) ??
  DEFAULT_GOOGLE_IOS_CLIENT_ID;
const googleIosUrlScheme =
  asNonEmptyString(Constants.expoConfig?.extra?.GOOGLE_IOS_URL_SCHEME) ??
  deriveGoogleIosUrlScheme(googleIosClientId) ??
  DEFAULT_GOOGLE_IOS_URL_SCHEME;

let isGoogleSignInInFlight = false;

GoogleSignin.configure({
  webClientId: googleWebClientId,
  iosClientId: googleIosClientId,
});

const assertGoogleIosUrlSchemeIsRegistered = async (): Promise<void> => {
  if (Platform.OS !== 'ios') {
    return;
  }

  const canOpenGoogleScheme = await Linking.canOpenURL(`${googleIosUrlScheme}://oauth`);
  if (!canOpenGoogleScheme) {
    throw createAppError({
      kind: 'SocialAuth',
      code: 'ios_unavailable',
      message:
        'Google Sign-In is unavailable on this iOS build (missing URL scheme configuration).',
    });
  }
};

/**
 * Initiates the Apple Sign-In flow and returns the identity token.
 * @returns A {@link SocialAuthResult} with provider `'apple'` and the identity token.
 * @throws If the user cancels or Apple does not return a token.
 */
export const signInWithApple = async (): Promise<SocialAuthResult> => {
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
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
  };
};

/**
 * Native Android `DEVELOPER_ERROR` rejection code emitted by RNGoogleSigninModule:
 * `String.valueOf(CommonStatusCodes.DEVELOPER_ERROR)` = `"10"`.
 *
 * The library's `statusCodes` constant does not currently re-export DEVELOPER_ERROR
 * (cf. node_modules/.../errors/errorCodes.d.ts), so we match the raw code defensively.
 */
const GOOGLE_DEVELOPER_ERROR_CODE = '10';

/**
 * Maps a native Google Sign-In error code to a stable AppError code consumed by the UI layer.
 * Native error `code` values come from `statusCodes` exported by `@react-native-google-signin/google-signin`.
 */
const mapGoogleNativeErrorCode = (
  nativeCode: unknown,
):
  | 'google_cancelled'
  | 'google_in_progress'
  | 'google_play_services_unavailable'
  | 'google_developer_error'
  | 'google_unknown' => {
  if (nativeCode === statusCodes.SIGN_IN_CANCELLED) return 'google_cancelled';
  if (nativeCode === statusCodes.IN_PROGRESS) return 'google_in_progress';
  if (nativeCode === statusCodes.PLAY_SERVICES_NOT_AVAILABLE)
    return 'google_play_services_unavailable';
  if (nativeCode === GOOGLE_DEVELOPER_ERROR_CODE) return 'google_developer_error';
  return 'google_unknown';
};

const isOurSocialAuthError = (error: unknown): boolean => {
  return (
    !!error &&
    typeof error === 'object' &&
    'kind' in error &&
    (error as { kind?: unknown }).kind === 'SocialAuth'
  );
};

/**
 * Initiates the Google Sign-In flow and returns the identity token.
 * @returns A {@link SocialAuthResult} with provider `'google'` and the ID token.
 * @throws An {@link AppError} with `kind: 'SocialAuth'` for cancellation, in-progress,
 *   missing Play Services, developer config errors, or any other native failure.
 */
export const signInWithGoogle = async (): Promise<SocialAuthResult> => {
  if (isGoogleSignInInFlight) {
    throw createAppError({
      kind: 'SocialAuth',
      code: 'google_in_progress',
      message: 'Google Sign-In already in progress',
    });
  }

  isGoogleSignInInFlight = true;

  try {
    if (Platform.OS === 'android') {
      await GoogleSignin.hasPlayServices();
    } else if (Platform.OS === 'ios') {
      await assertGoogleIosUrlSchemeIsRegistered();
    }

    const response = await GoogleSignin.signIn();

    if (response.type !== 'success' || !response.data.idToken) {
      throw createAppError({
        kind: 'SocialAuth',
        code: 'google_no_id_token',
        message: 'Google Sign-In failed: no ID token',
      });
    }

    return {
      provider: 'google',
      idToken: response.data.idToken,
    };
  } catch (rawError: unknown) {
    // Re-throw our own AppErrors untouched (e.g. google_in_progress, google_no_id_token,
    // ios_unavailable) so they keep their canonical code.
    if (isOurSocialAuthError(rawError)) {
      throw rawError;
    }

    const nativeCode = (rawError as { code?: unknown } | null)?.code;
    const nativeMessage = rawError instanceof Error ? rawError.message : 'Google Sign-In failed';

    throw createAppError({
      kind: 'SocialAuth',
      code: mapGoogleNativeErrorCode(nativeCode),
      message: nativeMessage,
    });
  } finally {
    isGoogleSignInInFlight = false;
  }
};

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
