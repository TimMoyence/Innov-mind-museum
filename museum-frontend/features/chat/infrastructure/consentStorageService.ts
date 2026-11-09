import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sentry from '@sentry/react-native';

import { extractUserIdFromToken } from '@/features/auth/domain/authLogic.pure';
import { getAccessToken } from '@/features/auth/infrastructure/authTokenStore';

const ANON_NAMESPACE = '__anon';

const consentMemoKey = (): string => {
  let userId: string | null = null;
  try {
    const token = getAccessToken();
    userId = token ? extractUserIdFromToken(token) : null;
  } catch {
    userId = null;
  }
  return `musaium.consent.aiAccepted.${userId ?? ANON_NAMESPACE}`;
};

export const consentStorageService = {
  async readAccepted(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(consentMemoKey());
    } catch (err: unknown) {
      Sentry.captureException(err, { tags: { flow: 'consent.read' } });
      throw err;
    }
  },

  async setAccepted(): Promise<void> {
    try {
      await AsyncStorage.setItem(consentMemoKey(), 'true');
    } catch {}
  },

  async clearAccepted(): Promise<void> {
    try {
      await AsyncStorage.removeItem(consentMemoKey());
    } catch (err: unknown) {
      Sentry.captureException(err, { tags: { flow: 'consent.clear' } });
    }
  },

  __testMemoKey(): string {
    return consentMemoKey();
  },
};

export const clearConsentAcceptedFlag = (): Promise<void> => consentStorageService.clearAccepted();
