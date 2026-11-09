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
