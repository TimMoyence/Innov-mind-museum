import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

/** Supported social identity providers for sign-in. */
export type SocialProvider = 'apple' | 'google';

/** Result of a successful social sign-in containing the provider name and its identity token. */
export interface SocialAuthResult {
  provider: SocialProvider;
  idToken: string;
}

GoogleSignin.configure({
  webClientId:
    Constants.expoConfig?.extra?.GOOGLE_WEB_CLIENT_ID ||
    '498339023976-bjbain2ir2t9q4pu9lsmmk8ni7t96dd7.apps.googleusercontent.com',
  iosClientId:
    Constants.expoConfig?.extra?.GOOGLE_IOS_CLIENT_ID ||
    '498339023976-8r199kpqbqmhb7mdf45ostg3sutqeng2.apps.googleusercontent.com',
});

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
    throw new Error('Apple Sign-In failed: no identity token');
  }

  return {
    provider: 'apple',
    idToken: credential.identityToken,
  };
};

/**
 * Initiates the Google Sign-In flow and returns the identity token.
 * @returns A {@link SocialAuthResult} with provider `'google'` and the ID token.
 * @throws If the user cancels or Google does not return a token.
 */
export const signInWithGoogle = async (): Promise<SocialAuthResult> => {
  await GoogleSignin.hasPlayServices();
  const response = await GoogleSignin.signIn();

  if (response.type !== 'success' || !response.data.idToken) {
    throw new Error('Google Sign-In failed: no ID token');
  }

  return {
    provider: 'google',
    idToken: response.data.idToken,
  };
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
