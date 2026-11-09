import * as Sentry from '@sentry/react-native';
import type { EmitterSubscription } from 'react-native';
import {
  addSslPinningErrorListener,
  initializeSslPinning,
  isSslPinningAvailable,
} from 'react-native-ssl-public-key-pinning';

import {
  buildPinningOptions,
  FAIL_OPEN_STATE,
  KILL_SWITCH_CACHE_TTL_MS,
  KILL_SWITCH_PATH,
  parseKillSwitchPayload,
  type KillSwitchState,
} from '@/shared/config/cert-pinning';
import { readEnvString } from '@/shared/lib/env';
import { storage } from './storage';

const KILL_SWITCH_CACHE_KEY = 'cert-pinning.kill-switch.v1';

let activeListener: EmitterSubscription | null = null;

const isEnvEnabled = (): boolean => {
  return readEnvString(process.env.EXPO_PUBLIC_CERT_PINNING_ENABLED)?.toLowerCase() === 'true';
};

const isCacheFresh = (state: KillSwitchState): boolean => {
  if (state.source === 'fail-open') return false;
  const fetchedAt = Date.parse(state.fetchedAt);
  if (Number.isNaN(fetchedAt)) return false;
  return Date.now() - fetchedAt < KILL_SWITCH_CACHE_TTL_MS;
};

export const resolveKillSwitchState = async (params: {
  apiBaseUrl?: string;
  fetchImpl?: typeof fetch;
  storageImpl?: typeof storage;
}): Promise<KillSwitchState> => {
  const store = params.storageImpl ?? storage;
  const cached = await store.getJSON<KillSwitchState>(KILL_SWITCH_CACHE_KEY);
  if (cached && isCacheFresh(cached)) {
    return { ...cached, source: 'cache' };
  }

  if (!params.apiBaseUrl) {
    return FAIL_OPEN_STATE;
  }

  const fetcher = params.fetchImpl ?? fetch;
  try {
    const response = await fetcher(`${params.apiBaseUrl}${KILL_SWITCH_PATH}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      return FAIL_OPEN_STATE;
    }
    const json = (await response.json()) as unknown;
    const fresh = parseKillSwitchPayload(json);
    await store.setJSON(KILL_SWITCH_CACHE_KEY, fresh);
    return fresh;
  } catch {
    return FAIL_OPEN_STATE;
  }
};

export type CertPinningInitOutcome =
  | { kind: 'skipped'; reason: 'env-disabled' | 'kill-switch-disabled' | 'native-unavailable' }
  | { kind: 'initialized'; killSwitchSource: KillSwitchState['source'] };

export const initCertPinning = async (params: {
  apiBaseUrl?: string;
  fetchImpl?: typeof fetch;
  storageImpl?: typeof storage;
}): Promise<CertPinningInitOutcome> => {
  if (!isEnvEnabled()) {
    return { kind: 'skipped', reason: 'env-disabled' };
  }
  if (!isSslPinningAvailable()) {
    Sentry.addBreadcrumb({
      category: 'cert-pinning',
      level: 'warning',
      message: 'native-module-unavailable',
    });
    return { kind: 'skipped', reason: 'native-unavailable' };
  }

  const killSwitch = await resolveKillSwitchState(params);
  Sentry.addBreadcrumb({
    category: 'cert-pinning',
    level: 'info',
    message: 'kill-switch-resolved',
    data: { source: killSwitch.source, pinningDisabled: killSwitch.pinningDisabled },
  });

  if (killSwitch.pinningDisabled) {
    return { kind: 'skipped', reason: 'kill-switch-disabled' };
  }

  if (activeListener) {
    activeListener.remove();
    activeListener = null;
  }

  activeListener = addSslPinningErrorListener((error) => {
    Sentry.captureMessage('cert-pinning.mismatch', {
      level: 'error',
      tags: { 'cert-pinning.host': error.serverHostname },
      extra: { message: error.message },
    });
  });

  await initializeSslPinning(buildPinningOptions());
  Sentry.addBreadcrumb({
    category: 'cert-pinning',
    level: 'info',
    message: 'initialized',
    data: { source: killSwitch.source },
  });
  return { kind: 'initialized', killSwitchSource: killSwitch.source };
};

export const disposeCertPinning = (): void => {
  if (activeListener) {
    activeListener.remove();
    activeListener = null;
    Sentry.addBreadcrumb({
      category: 'cert-pinning',
      level: 'info',
      message: 'disposed',
    });
  }
};
