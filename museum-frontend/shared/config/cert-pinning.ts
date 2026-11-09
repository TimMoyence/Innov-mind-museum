import type { PinningOptions } from 'react-native-ssl-public-key-pinning';

export const PINNED_HOST = 'musaium.com' as const;

export const PROD_SPKI_HASHES = [
  'ZDRgYM8cmWD/dXjUsAFfxIfU1sMuaUCykdASVIJb8MY=',
  'iFvwVyJSxnQdyaUvUERIf+8qk7gRze3612JMwoO3zdU=',
] as const;

export const PINSET_EXPIRATION_DATE = '2027-03-12' as const;

export const buildPinningOptions = (
  hashes: readonly string[] = PROD_SPKI_HASHES,
): PinningOptions => ({
  [PINNED_HOST]: {
    publicKeyHashes: [...hashes],
    includeSubdomains: false,
    expirationDate: PINSET_EXPIRATION_DATE,
  },
});

export interface KillSwitchState {
  pinningDisabled: boolean;
  source: 'cache' | 'network' | 'fail-open';
  fetchedAt: string;
}

export const FAIL_OPEN_STATE: KillSwitchState = {
  pinningDisabled: false,
  source: 'fail-open',
  fetchedAt: new Date(0).toISOString(),
};

export const KILL_SWITCH_CACHE_TTL_MS = 60 * 60 * 1000;
export const KILL_SWITCH_PATH = '/api/config/cert-pinning-enabled';

export const parseKillSwitchPayload = (raw: unknown): KillSwitchState => {
  if (
    raw !== null &&
    typeof raw === 'object' &&
    'pinningEnabled' in raw &&
    typeof (raw as { pinningEnabled: unknown }).pinningEnabled === 'boolean'
  ) {
    const enabled = (raw as { pinningEnabled: boolean }).pinningEnabled;
    return {
      pinningDisabled: !enabled,
      source: 'network',
      fetchedAt: new Date().toISOString(),
    };
  }
  return { ...FAIL_OPEN_STATE, source: 'fail-open' };
};
