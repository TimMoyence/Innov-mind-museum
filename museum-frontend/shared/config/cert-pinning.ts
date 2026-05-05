/**
 * Cert pinning configuration — Phase 2 scaffold (V1 ship-disabled).
 *
 * Security trade-off documented in ADR-016 (library selected) and
 * ADR-031 (kill-switch architecture). Activation is gated by the env
 * var `EXPO_PUBLIC_CERT_PINNING_ENABLED`; default `false` means no
 * pinning is initialised at boot, so a missing kill-switch endpoint
 * cannot brick the V1 launch.
 *
 * **Before flipping the env to `true` for any production build**, the
 * placeholder SPKI hashes below MUST be replaced with the real
 * base64-encoded SHA-256 hashes of the production leaf cert + a
 * backup CA. See `docs/RUNBOOKS/CERT_ROTATION.md` for the capture
 * procedure (`openssl s_client … | openssl x509 -pubkey | openssl rsa
 * -pubin -outform der | openssl dgst -sha256 -binary | openssl enc -base64`).
 */
import type { PinningOptions } from 'react-native-ssl-public-key-pinning';

/** Production API host. The mobile client only needs to pin this one. */
export const PINNED_HOST = 'api.musaium.app' as const;

/**
 * SPKI hashes for the production leaf cert + backup CA.
 *
 * **PLACEHOLDERS — DO NOT ACTIVATE.** These are syntactically valid
 * base64 SHA-256 strings but they do NOT match the production cert.
 * Replace with real captures captured against the production endpoint
 * before flipping `EXPO_PUBLIC_CERT_PINNING_ENABLED` to `true`.
 *
 * The two-pin requirement is iOS-mandatory (TrustKit refuses single-pin
 * configurations) and operationally mandatory (kill-switch + rotation
 * needs both leaf + backup so we can rotate the leaf without re-shipping).
 */
export const PLACEHOLDER_SPKI_HASHES_TBD_PROD = [
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', // leaf — TBD
  'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBA=', // backup — TBD
] as const;

/**
 * Builds the {@link PinningOptions} payload consumed by
 * `initializeSslPinning`. Kept as a function (not a const) so the
 * placeholder list can be swapped in tests via dependency injection.
 */
export const buildPinningOptions = (
  hashes: readonly string[] = PLACEHOLDER_SPKI_HASHES_TBD_PROD,
): PinningOptions => ({
  [PINNED_HOST]: {
    publicKeyHashes: [...hashes],
    includeSubdomains: false,
  },
});

/**
 * Result of a kill-switch fetch.
 *
 * - `pinningDisabled === true` → caller MUST skip `initializeSslPinning`.
 * - `pinningDisabled === false` → caller proceeds with pinning.
 * - `source === 'cache' | 'network' | 'fail-open'` is logged for diagnostics.
 */
export interface KillSwitchState {
  pinningDisabled: boolean;
  source: 'cache' | 'network' | 'fail-open';
  fetchedAt: string;
}

/**
 * Default state when no signal is available. **Fail-open in the security
 * sense**: assume pinning is allowed to proceed, so an attacker who
 * blocks the kill-switch endpoint cannot trivially neutralise pinning.
 */
export const FAIL_OPEN_STATE: KillSwitchState = {
  pinningDisabled: false,
  source: 'fail-open',
  fetchedAt: new Date(0).toISOString(),
};

export const KILL_SWITCH_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
export const KILL_SWITCH_PATH = '/api/config/cert-pinning-enabled';

/**
 * Parses the kill-switch JSON payload returned by the BE config endpoint.
 *
 * Expected shape: `{ "pinningEnabled": boolean }`. Any malformed payload
 * resolves to fail-open so a BE schema mismatch cannot brick clients.
 */
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
