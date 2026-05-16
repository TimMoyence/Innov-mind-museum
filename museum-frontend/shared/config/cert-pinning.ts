/**
 * Cert pinning configuration — production pinset for `musaium.com`.
 *
 * Library + decision: ADR-016 (`react-native-ssl-public-key-pinning`).
 * Kill-switch architecture: ADR-031 (`/api/config/cert-pinning-enabled`,
 * 1h cache, fail-open semantics).
 *
 * Activation:
 *   `EXPO_PUBLIC_CERT_PINNING_ENABLED=true` in `.env.production`
 *   (and equivalents). When unset / `false`, `cert-pinning-init.ts`
 *   no-ops at boot.
 *
 * Pin selection rationale (captured 2026-05-14 against musaium.com:443):
 *   - Pin #1 = current leaf SPKI. Let's Encrypt issues 90-day certs;
 *     this pin breaks at the next renewal unless the renewed leaf
 *     reuses the same keypair OR Pin #2 still matches.
 *   - Pin #2 = Let's Encrypt E8 intermediate SPKI. E8 is the ECDSA
 *     intermediate currently signing musaium.com leaves; stable until
 *     2027-03-12. Acts as the "backup that absorbs leaf rotation" —
 *     as long as the next leaf is signed by E8, TLS still validates.
 *
 *   When E8 rotates (expected ~late 2026 based on Let's Encrypt's
 *   historical intermediate cadence), bump the app with the new
 *   intermediate SPKI BEFORE the prod cert chain switches. See
 *   `museum-frontend/docs/CERT_PINNING_RUNBOOK.md` for the 7-step
 *   rotation procedure.
 */
import type { PinningOptions } from 'react-native-ssl-public-key-pinning';

/** Production API host. The mobile client only needs to pin this one. */
export const PINNED_HOST = 'musaium.com' as const;

/**
 * SPKI SHA-256 base64 hashes pinned for `musaium.com`.
 *
 * Captured 2026-05-14 with:
 *   openssl s_client -connect musaium.com:443 -servername musaium.com </dev/null 2>/dev/null \
 *     | openssl x509 -pubkey -noout \
 *     | openssl pkey -pubin -outform DER \
 *     | openssl dgst -sha256 -binary \
 *     | openssl enc -base64
 *
 * Pin #1 = leaf cert (Let's Encrypt, notAfter 2026-06-19, ECDSA P-256).
 * Pin #2 = intermediate CA E8 (Let's Encrypt, notAfter 2027-03-12, ECDSA P-384).
 *
 * The two-pin layout is iOS-mandatory (TrustKit refuses single-pin
 * configurations) and operationally protects against the LE 90-day
 * leaf rotation: as long as the rotated leaf is signed by E8, the
 * intermediate pin keeps validation green even if pin #1 ages out.
 */
export const PROD_SPKI_HASHES = [
  'ZDRgYM8cmWD/dXjUsAFfxIfU1sMuaUCykdASVIJb8MY=', // leaf — musaium.com, LE, exp 2026-06-19
  'iFvwVyJSxnQdyaUvUERIf+8qk7gRze3612JMwoO3zdU=', // intermediate — Let's Encrypt E8, exp 2027-03-12
] as const;

/**
 * Builds the {@link PinningOptions} payload consumed by
 * `initializeSslPinning`. Kept as a function (not a const) so the
 * pinset can be swapped in tests via dependency injection.
 */
export const buildPinningOptions = (
  hashes: readonly string[] = PROD_SPKI_HASHES,
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
