/**
 * RED (W1-L1-04) — helper B `withNetworkSim` + `mulberry32` + `FakeClock`.
 *
 * Proves the absence of the deterministic network-simulation harness:
 * - latency is advanced through an INJECTED FakeClock (no real timers, no Date.now),
 * - packet loss is seeded via mulberry32 (same seed → identical sequence; never Math.random),
 * - a configured delay greater than the axios timeout (`AXIOS_TIMEOUT_MS`, sourced from
 *   `httpClient.ts:172` = 15000) resolves to a Timeout AppError that `isRetryableError`
 *   treats as retryable (spec R5).
 *
 * None of `withNetworkSim` / `mulberry32` / `FakeClock` / `AXIOS_TIMEOUT_MS` exist yet,
 * so the imports resolve to nothing and the suite fails.
 *
 * lib-docs:
 * - @react-native-community/netinfo PATTERNS.md:181 (§4 — default reachability timeout 15s;
 *   a degraded network can stall a request that long).
 */
import { isRetryableError } from '@/shared/lib/retry';
import { isAppError } from '@/shared/lib/errors';
import { NETWORK_PROFILES } from '@/shared/infrastructure/connectivity/networkProfiles';
import {
  withNetworkSim,
  mulberry32,
  FakeClock,
  AXIOS_TIMEOUT_MS,
} from '@/shared/testing/withNetworkSim';

describe('mulberry32 (seeded PRNG)', () => {
  it('produces an identical sequence for the same seed (deterministic, no Math.random)', () => {
    const a = mulberry32(1234);
    const b = mulberry32(1234);
    const seqA = [a(), a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b(), b()];

    expect(seqA).toEqual(seqB);
  });

  it('produces a different sequence for a different seed', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);

    expect(a()).not.toBe(b());
  });

  it('only emits values in [0, 1)', () => {
    const rng = mulberry32(99);
    for (let i = 0; i < 50; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('FakeClock (injected deterministic clock)', () => {
  it('starts at 0 and advances only when told', () => {
    const clock = new FakeClock();
    expect(clock.now()).toBe(0);

    clock.advance(250);
    expect(clock.now()).toBe(250);

    clock.advance(100);
    expect(clock.now()).toBe(350);
  });

  it('resolves scheduled timers at their due time, in order', async () => {
    const clock = new FakeClock();
    const fired: number[] = [];

    void clock.setTimeout(() => fired.push(20), 20);
    void clock.setTimeout(() => fired.push(10), 10);

    await clock.advance(10);
    expect(fired).toEqual([10]);

    await clock.advance(10);
    expect(fired).toEqual([10, 20]);
  });
});

describe('withNetworkSim (deterministic latency + loss)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('advances latency through the injected FakeClock (no wall-clock wait)', async () => {
    const clock = new FakeClock();
    const sim = withNetworkSim(NETWORK_PROFILES['2g'], { clock, seed: 7 });

    const promise = sim.run(async () => 'ok');
    await clock.advance(NETWORK_PROFILES['2g'].latencyMs);
    await expect(promise).resolves.toBe('ok');
    expect(clock.now()).toBe(NETWORK_PROFILES['2g'].latencyMs);
  });

  it('drops the same calls for the same seed (mulberry32 seeded, never Math.random)', async () => {
    const clock1 = new FakeClock();
    const clock2 = new FakeClock();
    const lossy = NETWORK_PROFILES['3g-lossy'];

    const outcomesFor = async (clock: FakeClock): Promise<boolean[]> => {
      const sim = withNetworkSim(lossy, { clock, seed: 42 });
      const results: boolean[] = [];
      for (let i = 0; i < 12; i++) {
        const p = sim
          .run(async () => true)
          .then(() => true)
          .catch(() => false);
        await clock.advance(lossy.latencyMs);
        results.push(await p);
      }
      return results;
    };

    expect(await outcomesFor(clock1)).toEqual(await outcomesFor(clock2));
  });

  it('maps a delay greater than AXIOS_TIMEOUT_MS to a retryable Timeout AppError', async () => {
    const clock = new FakeClock();
    const sim = withNetworkSim(NETWORK_PROFILES['2g'], {
      clock,
      seed: 1,
      delayMs: AXIOS_TIMEOUT_MS + 1,
    });

    const promise = sim.run(async () => 'never').catch((e: unknown) => e);
    await clock.advance(AXIOS_TIMEOUT_MS + 1);
    const error = await promise;

    expect(isAppError(error)).toBe(true);
    expect((error as { kind: string }).kind).toBe('Timeout');
    expect(isRetryableError(error)).toBe(true);
  });

  it('sources AXIOS_TIMEOUT_MS from the httpClient default (15000)', () => {
    expect(AXIOS_TIMEOUT_MS).toBe(15000);
  });
});
