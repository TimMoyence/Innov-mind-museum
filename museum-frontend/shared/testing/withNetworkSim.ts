import { createAppError } from '@/shared/types/AppError';
import type { NetworkProfile } from '@/shared/infrastructure/connectivity/networkProfiles';

import type { FakeClock } from './fakeClock';
import { mulberry32 } from './mulberry32';

export const AXIOS_TIMEOUT_MS = 15000;

export interface NetworkSimOptions {
  readonly clock: FakeClock;
  readonly seed: number;
  readonly delayMs?: number;
}

export interface NetworkSim {
  run<T>(op: () => Promise<T>): Promise<T>;
}

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

export { FakeClock } from './fakeClock';
export { mulberry32 } from './mulberry32';
export { paceTokens } from './paceTokens';
export type { PaceTokensOptions } from './paceTokens';
