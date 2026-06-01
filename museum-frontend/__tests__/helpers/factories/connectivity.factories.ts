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
}

/**
 * Structural NetInfo snapshot the REAL `resolveDataMode` consumes. `details`
 * carries the nested `isConnectionExpensive` + `cellularGeneration` (design
 * anchor §3 / netinfo PATTERNS §Types). Defaults model a connected cellular 4g
 * interface; pass overrides to model degraded / offline conditions.
 */
export const makeNetInfoSnapshot = (
  overrides?: NetInfoSnapshotOverrides,
): NetInfoSnapshot & { readonly isInternetReachable: boolean | null } => {
  const isConnected = overrides?.isConnected ?? true;
  return {
    isConnected,
    isInternetReachable: overrides?.isInternetReachable ?? isConnected,
    type: overrides?.type ?? 'cellular',
    details: {
      isConnectionExpensive: overrides?.isConnectionExpensive ?? false,
      cellularGeneration: overrides?.cellularGeneration ?? '4g',
    },
  };
};
