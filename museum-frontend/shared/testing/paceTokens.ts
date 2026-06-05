/**
 * Helper C (TEST-ONLY) — `paceTokens`.
 *
 * Emits each streaming token through an `onToken` callback, spacing emissions by
 * the profile's downlink bandwidth (`bwDownKbps`) via an INJECTED
 * {@link FakeClock} (no real timers, no `Date.now`). The concatenation of emitted
 * tokens equals the original input (lossless pacing). A slower profile spreads
 * the tokens over more virtual time than a fast one.
 *
 * lib-docs: @react-native-community/netinfo PATTERNS.md:181 (§4 — degraded
 * bandwidth stalls delivery; pacing models the per-chunk inter-arrival delay).
 */
import type { NetworkProfile } from '@/shared/infrastructure/connectivity/networkProfiles';

import type { FakeClock } from './fakeClock';

export interface PaceTokensOptions {
  readonly profile: NetworkProfile;
  readonly clock: FakeClock;
  readonly onToken: (token: string) => void;
}

/**
 * Inter-token delay (ms) for a profile's downlink bandwidth. Higher bandwidth →
 * smaller delay. Floored at 1ms so timestamps are strictly increasing even on
 * the fast (`normal`) control profile.
 */
function interTokenDelayMs(profile: NetworkProfile): number {
  if (profile.bwDownKbps <= 0) return 1000;
  return Math.max(1, Math.round(8000 / profile.bwDownKbps));
}

/**
 * Schedules every token onto the FakeClock at strictly increasing due times and
 * resolves once the last token has been emitted. Drive it with
 * `await clock.runAll()` then `await paceTokens(...)`.
 */
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
