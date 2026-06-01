/**
 * Helper B (TEST-ONLY) — `withNetworkSim` deterministic latency + loss harness.
 *
 * Wraps an async unit of work in a simulated degraded network:
 *  - latency is advanced through an INJECTED {@link FakeClock} (no real timers,
 *    no `Date.now`),
 *  - packet loss is seeded via {@link mulberry32} (same seed → identical drop
 *    sequence; NEVER `Math.random`),
 *  - a configured delay greater than the axios request timeout
 *    ({@link AXIOS_TIMEOUT_MS}) resolves to a retryable Timeout AppError
 *    (spec R5 — a degraded interface can stall a request past the 15s timeout).
 *
 * NEVER imported by `app/**` — enforced by the `no-restricted-imports` boundary
 * (eslint.config.mjs).
 *
 * lib-docs: @react-native-community/netinfo PATTERNS.md:181 (§4 — default
 * reachability timeout 15s; a degraded network can stall a request that long).
 */
import { createAppError } from '@/shared/types/AppError';
import type { NetworkProfile } from '@/shared/infrastructure/connectivity/networkProfiles';

import type { FakeClock } from './fakeClock';
import { mulberry32 } from './mulberry32';

/**
 * Axios request timeout (ms). Source of truth: `shared/infrastructure/httpClient.ts:172`
 * (`timeout: 15000`). Kept as an asserted literal here (the production value is
 * inlined in the axios instance, not exported); the harness test pins it to 15000
 * so a drift in httpClient surfaces as a failing assertion.
 */
export const AXIOS_TIMEOUT_MS = 15000;

export interface NetworkSimOptions {
  /** Injected deterministic clock — latency/timeouts advance through it. */
  readonly clock: FakeClock;
  /** PRNG seed for packet-loss decisions (mulberry32). */
  readonly seed: number;
  /** Override the per-call delay (defaults to the profile's `latencyMs`). */
  readonly delayMs?: number;
}

export interface NetworkSim {
  /** Runs `op` under the simulated network, resolving/rejecting per latency + loss. */
  run<T>(op: () => Promise<T>): Promise<T>;
}

/**
 * Builds a stateful simulator for a profile. Packet-loss decisions consume a
 * single seeded PRNG, so repeated `run` calls on the same sim (same seed)
 * produce a stable drop sequence across identical clocks.
 */
export function withNetworkSim(profile: NetworkProfile, options: NetworkSimOptions): NetworkSim {
  const { clock, seed } = options;
  const delayMs = options.delayMs ?? profile.latencyMs;
  const rng = mulberry32(seed);

  return {
    run<T>(op: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        void clock.setTimeout(() => {
          if (delayMs > AXIOS_TIMEOUT_MS) {
            reject(
              createAppError({
                kind: 'Timeout',
                message: `Simulated network stall exceeded ${String(AXIOS_TIMEOUT_MS)}ms`,
              }),
            );
            return;
          }
          // Draw once per call so the loss sequence is seed-deterministic.
          const dropped = rng() < profile.lossPct;
          if (dropped) {
            reject(createAppError({ kind: 'Network', message: 'Simulated packet loss' }));
            return;
          }
          op().then(resolve, reject);
        }, delayMs);
      });
    },
  };
}

// Re-exported so the harness suites import a single entry point.
export { FakeClock } from './fakeClock';
export { mulberry32 } from './mulberry32';
export { paceTokens } from './paceTokens';
export type { PaceTokensOptions } from './paceTokens';
