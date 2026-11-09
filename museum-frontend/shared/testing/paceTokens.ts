import type { NetworkProfile } from '@/shared/infrastructure/connectivity/networkProfiles';

import type { FakeClock } from './fakeClock';

export interface PaceTokensOptions {
  readonly profile: NetworkProfile;
  readonly clock: FakeClock;
  readonly onToken: (token: string) => void;
}

function interTokenDelayMs(profile: NetworkProfile): number {
  if (profile.bwDownKbps <= 0) return 1000;
  return Math.max(1, Math.round(8000 / profile.bwDownKbps));
}

export function paceTokens(tokens: readonly string[], options: PaceTokensOptions): Promise<void> {
  const { profile, clock, onToken } = options;
  if (tokens.length === 0) return Promise.resolve();

  const delay = interTokenDelayMs(profile);
  const pending = tokens.map((token, index) =>
    clock.setTimeout(
      () => {
        onToken(token);
      },
      delay * (index + 1),
    ),
  );

  return Promise.all(pending).then(() => undefined);
}
