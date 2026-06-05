/**
 * RED (W1-L1-06) — helper C `paceTokens`.
 *
 * Proves the absence of the streaming-token pacer that emits each token through
 * an `onToken` callback, spacing emissions by the profile's downlink bandwidth
 * (`bwDownKbps`) via an INJECTED FakeClock (no real timers). The concatenation of
 * emitted tokens MUST equal the original input (lossless pacing).
 *
 * `paceTokens` / `FakeClock` do not exist yet → import resolves to nothing → suite fails.
 *
 * lib-docs:
 * - @react-native-community/netinfo PATTERNS.md:181 (§4 — degraded bandwidth stalls
 *   delivery; pacing models the per-chunk inter-arrival delay).
 */
import { NETWORK_PROFILES } from '@/shared/infrastructure/connectivity/networkProfiles';
import { paceTokens, FakeClock } from '@/shared/testing/withNetworkSim';
import { nonNull } from '@/__tests__/helpers/nonNull';

describe('paceTokens (helper C)', () => {
  it('emits every token and concatenation equals the input', async () => {
    const clock = new FakeClock();
    const input = ['Hel', 'lo ', 'wor', 'ld'];
    const received: string[] = [];

    const done = paceTokens(input, {
      profile: NETWORK_PROFILES['2g'],
      clock,
      onToken: (t) => received.push(t),
    });

    await clock.runAll();
    await done;

    expect(received).toEqual(input);
    expect(received.join('')).toBe('Hello world');
  });

  it('paces emissions on the FakeClock (slow profile spreads tokens over time)', async () => {
    const clock = new FakeClock();
    const input = ['a', 'b', 'c'];
    const emittedAt: number[] = [];

    const done = paceTokens(input, {
      profile: NETWORK_PROFILES['2g'],
      clock,
      onToken: () => emittedAt.push(clock.now()),
    });

    await clock.runAll();
    await done;

    // monotonic, strictly increasing emission timestamps under a slow profile
    expect(emittedAt).toHaveLength(3);
    expect(nonNull(emittedAt[1])).toBeGreaterThan(nonNull(emittedAt[0]));
    expect(nonNull(emittedAt[2])).toBeGreaterThan(nonNull(emittedAt[1]));
  });

  it('emits the normal (fast) profile faster than the 2g (slow) profile', async () => {
    const measure = async (profileName: 'normal' | '2g'): Promise<number> => {
      const clock = new FakeClock();
      const done = paceTokens(['x', 'y', 'z', 'w'], {
        profile: NETWORK_PROFILES[profileName],
        clock,
        onToken: () => undefined,
      });
      await clock.runAll();
      await done;
      return clock.now();
    };

    expect(await measure('normal')).toBeLessThan(await measure('2g'));
  });

  it('handles an empty token list without scheduling any emission', async () => {
    const clock = new FakeClock();
    const received: string[] = [];

    const done = paceTokens([], {
      profile: NETWORK_PROFILES.normal,
      clock,
      onToken: (t) => received.push(t),
    });

    await clock.runAll();
    await done;

    expect(received).toEqual([]);
    expect(clock.now()).toBe(0);
  });
});
