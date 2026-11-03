import Constants from 'expo-constants';

import { readEnvString } from '@/shared/lib/env';

import { resolveApiBaseUrl, resolveVariant } from '../../api-url.config';

export const resolveInitialApiBaseUrl = (): string => {
  const extra = (Constants.expoConfig as { extra?: Record<string, unknown> } | undefined)?.extra;
  const stamped = readEnvString(extra?.API_BASE_URL);
  if (stamped) {
    return stamped;
  }
  const env = { EXPO_PUBLIC_API_BASE_URL: readEnvString(process.env.EXPO_PUBLIC_API_BASE_URL) };
  return resolveApiBaseUrl(resolveVariant(env), env);
};
