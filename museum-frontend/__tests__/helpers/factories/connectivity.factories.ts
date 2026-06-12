import { faker } from '@faker-js/faker';

import type { QueuedMessage } from '@/features/chat/application/offlineQueue';
import type { NetInfoSnapshot } from '@/shared/infrastructure/connectivity/networkProfiles';

/**
 * Creates a {@link QueuedMessage} (offline-queue entry) with sensible defaults.
 * Used by the offline-queue + enqueue-on-disconnect tests so no test inlines the
 * entity shape (musaium-test-discipline/no-inline-test-entities, DRY).
 */
export const makeQueuedMessage = (overrides?: Partial<QueuedMessage>): QueuedMessage => ({
  id: faker.string.uuid(),
  sessionId: faker.string.uuid(),
  text: faker.lorem.sentence(),
  createdAt: faker.date.recent().getTime(),
  retryCount: 0,
  ...overrides,
});

/** Override bag for {@link makeNetInfoSnapshot} — flattens the nested NetInfo `details`. */
export interface NetInfoSnapshotOverrides {
  isConnected?: boolean | null;
  isInternetReachable?: boolean | null;
  type?: string;
  isConnectionExpensive?: boolean;
  cellularGeneration?: string | null;
  /** Pass `null` to model the cold-start / blank NetInfo shape (`details: null`). */
  details?: null;
}

/**
 * Structural NetInfo snapshot the REAL `resolveDataMode` consumes. `details`
 * carries the nested `isConnectionExpensive` + `cellularGeneration` (design
 * anchor §3 / netinfo PATTERNS §Types). Defaults model a connected cellular 4g
 * NON-metered interface (`isConnectionExpensive: false`); pass overrides to
 * model degraded / offline / metered conditions. Explicit `isConnected: null`
 * and `details: null` are preserved (cold-start tri-state, INV-11 — the old
 * `??` default swallowed `null`).
 */
export const makeNetInfoSnapshot = (
  overrides?: NetInfoSnapshotOverrides,
): NetInfoSnapshot & { readonly isInternetReachable: boolean | null } => {
  const isConnected = overrides?.isConnected === undefined ? true : overrides.isConnected;
  return {
    isConnected,
    isInternetReachable:
      overrides?.isInternetReachable === undefined ? isConnected : overrides.isInternetReachable,
    type: overrides?.type ?? 'cellular',
    details:
      overrides?.details === null
        ? null
        : {
            isConnectionExpensive: overrides?.isConnectionExpensive ?? false,
            cellularGeneration: overrides?.cellularGeneration ?? '4g',
          },
  };
};

/**
 * Passive network-quality sample consumed by the pure quality engine
 * (`shared/infrastructure/connectivity/networkQuality.ts`, design §2.1).
 * Declared structurally here (not imported from the engine module) so this
 * factory file compiles before the engine exists (red phase, A-R0 DONE-WHEN)
 * and stays assignable to the engine's `QualitySample` afterwards.
 */
export interface QualitySample {
  rttMs: number;
  ok: boolean;
  timedOut: boolean;
  atMs: number;
}

/**
 * Creates a {@link QualitySample} with sensible defaults (fast healthy
 * request: 100 ms, ok, not timed out, at t=0). DRY factory — tests must never
 * inline the sample shape (musaium-test-discipline/no-inline-test-entities).
 */
export const makeQualitySample = (overrides?: Partial<QualitySample>): QualitySample => ({
  rttMs: 100,
  ok: true,
  timedOut: false,
  atMs: 0,
  ...overrides,
});

/**
 * Edge-input variant for the tracker shell (`recordQualitySample`), which
 * stamps `atMs` itself with `Date.now()` (design §2.2) — same defaults as
 * {@link makeQualitySample} minus the timestamp.
 */
export const makeQualitySampleInput = (
  overrides?: Partial<Omit<QualitySample, 'atMs'>>,
): Omit<QualitySample, 'atMs'> => {
  const { atMs: _atMs, ...input } = makeQualitySample(overrides);
  return input;
};

/**
 * Builds a window of `n` {@link QualitySample}s with `atMs` spaced 1000 ms
 * apart (0, 1000, 2000, …). `overrides(i)` customizes each sample; an `atMs`
 * override wins over the spaced default.
 */
export const makeQualityWindow = (
  n: number,
  overrides?: (i: number) => Partial<QualitySample>,
): QualitySample[] =>
  Array.from({ length: n }, (_, i) => makeQualitySample({ atMs: i * 1000, ...overrides?.(i) }));
