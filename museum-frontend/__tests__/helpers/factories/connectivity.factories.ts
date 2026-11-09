import { faker } from '@faker-js/faker';

import type { QueuedMessage } from '@/features/chat/application/offlineQueue';
import type { NetInfoSnapshot } from '@/shared/infrastructure/connectivity/networkProfiles';

export const makeQueuedMessage = (overrides?: Partial<QueuedMessage>): QueuedMessage => ({
  id: faker.string.uuid(),
  sessionId: faker.string.uuid(),
  text: faker.lorem.sentence(),
  createdAt: faker.date.recent().getTime(),
  retryCount: 0,
  ...overrides,
});

export interface NetInfoSnapshotOverrides {
  isConnected?: boolean | null;
  isInternetReachable?: boolean | null;
  type?: string;
  isConnectionExpensive?: boolean;
  cellularGeneration?: string | null;
  details?: null;
}

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

export interface QualitySample {
  rttMs: number;
  ok: boolean;
  timedOut: boolean;
  atMs: number;
}

export const makeQualitySample = (overrides?: Partial<QualitySample>): QualitySample => ({
  rttMs: 100,
  ok: true,
  timedOut: false,
  atMs: 0,
  ...overrides,
});

export const makeQualitySampleInput = (
  overrides?: Partial<Omit<QualitySample, 'atMs'>>,
): Omit<QualitySample, 'atMs'> => {
  const { atMs: _atMs, ...input } = makeQualitySample(overrides);
  return input;
};

export const makeQualityWindow = (
  n: number,
  overrides?: (i: number) => Partial<QualitySample>,
): QualitySample[] =>
  Array.from({ length: n }, (_, i) => makeQualitySample({ atMs: i * 1000, ...overrides?.(i) }));
