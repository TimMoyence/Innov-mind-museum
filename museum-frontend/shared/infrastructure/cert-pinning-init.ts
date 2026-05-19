/**
 * Cert pinning runtime init — Phase 2 scaffold (V1 ship-disabled).
 *
 * Architecture documented in ADR-031 (kill-switch design).
 * Library + decision in ADR-016 (deferred -> Phase 2 scaffolded).
 *
 * Activation flow:
 *   1. Read env `EXPO_PUBLIC_CERT_PINNING_ENABLED`. Default `false` -> no-op.
 *   2. Resolve the kill-switch state (cache hit if fresh; else network fetch
 *      against `${apiBaseUrl}${KILL_SWITCH_PATH}`; else fail-open).
 *   3. If `pinningDisabled`, do NOT call `initializeSslPinning`.
 *   4. Otherwise wire `addSslPinningErrorListener` for Sentry telemetry and
 *      call `initializeSslPinning(buildPinningOptions())`.
 *
 * The init function is intentionally **fire-and-forget** at the call site:
 * a slow kill-switch fetch must not block the React tree from mounting.
 * Until the promise resolves, the network is effectively un-pinned, which
 * matches the kill-switch semantics (a mass-mispin event must surface
 * immediately on subsequent requests, not delay app start).
 */
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

/**
 * Module-scoped reference to the active `addSslPinningErrorListener`
 * subscription, so it can be detached on HMR/teardown. Single host
 * (`musaium.com`) → single listener, no registry needed. Reassigned
 * by `initCertPinning` (set) and `disposeCertPinning` (clear).
 *
 * Cited: `lib-docs/react-native-ssl-public-key-pinning/PATTERNS.md`
 * §2 lines 72-84 (always call `.remove()` on the returned subscription).
 */
let activeListener: EmitterSubscription | null = null;

// Bridges local/CI typing divergence on `process.env.X` reads via the
// canonical `readEnvString` helper. See museum-frontend/shared/lib/env.ts.
const isEnvEnabled = (): boolean => {
  return readEnvString(process.env.EXPO_PUBLIC_CERT_PINNING_ENABLED)?.toLowerCase() === 'true';
};

const isCacheFresh = (state: KillSwitchState): boolean => {
  if (state.source === 'fail-open') return false;
  const fetchedAt = Date.parse(state.fetchedAt);
  if (Number.isNaN(fetchedAt)) return false;
  return Date.now() - fetchedAt < KILL_SWITCH_CACHE_TTL_MS;
};

/**
 * Public surface for unit tests + the boot wiring.
 *
 * @param fetchImpl - Fetch function injected for tests. Defaults to global fetch.
 * @param storageImpl - Storage façade (defaults to AsyncStorage-backed).
 * @param apiBaseUrl - Base URL to call the kill-switch endpoint against.
 *   When omitted, kill-switch fetching is skipped and we fail-open.
 */
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

/**
 * Initialises cert pinning when the env flag is `true` AND the kill-switch
 * does not say `pinningEnabled: false`. Resolves to a structured outcome
 * the caller (or Sentry) can use for diagnostics; never throws.
 */
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

  // HMR / re-init safety: if a prior listener is still attached
  // (Fast Refresh re-runs the module), remove it before resubscribing
  // to avoid duplicate Sentry events on a single mismatch.
  // Cited PATTERNS.md §2 lines 72-84 (always call `.remove()` on the
  // returned subscription) + design §9 D2 HMR guard.
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

/**
 * Tears down the `cert-pinning.mismatch` listener registered by
 * `initCertPinning`. Safe to call when no listener was registered
 * (env-disabled boot path) — no-op, no throw.
 *
 * Intended call sites:
 *   - HMR teardown in `__DEV__` (Fast Refresh re-runs).
 *   - Unit tests asserting listener lifecycle (R3 acceptance).
 *
 * Cited: `lib-docs/react-native-ssl-public-key-pinning/PATTERNS.md`
 * §2 lines 72-84 — always call `.remove()` on the returned subscription.
 */
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
