/**
 * RED (W1-L1-16) — M7 geo/search + auth degraded-network retry caps (spec R6).
 *
 * Under an edge/2g profile a transient (Network/Timeout) failure is retried up to
 * the backoff cap, then surfaces an actionable AppError; an Unauthorized (401/403)
 * is NOT retried (`isRetryableError` returns false). Drives the simulated transport
 * through the test-only `withNetworkSim` harness and builds snapshots via the DRY
 * `makeNetInfoSnapshot` factory.
 *
 * Fails RED because `withNetworkSim` (`@/shared/testing/...`) and the
 * `makeNetInfoSnapshot` factory do not exist yet.
 *
 * lib-docs:
 * - @react-native-community/netinfo PATTERNS.md:173 (§4 — isConnected alone is not
 *   "API reachable"; degraded interfaces fail transiently).
 */
import { runWithRetry, isRetryableError } from '@/shared/lib/retry';
import { createAppError } from '@/shared/types/AppError';
import { NETWORK_PROFILES } from '@/shared/infrastructure/connectivity/networkProfiles';
import { withNetworkSim, FakeClock } from '@/shared/testing/withNetworkSim';
import { makeNetInfoSnapshot } from '@/__tests__/helpers/factories';

describe('M7 — degraded geo/search + auth retry caps', () => {
  it('snapshot factory yields a degraded (edge) cellular shape', () => {
    const snap = makeNetInfoSnapshot({ type: 'cellular', cellularGeneration: '2g' });

    expect(snap.isConnected).toBe(true);
    expect(snap.type).toBe('cellular');
    expect(snap.details?.cellularGeneration).toBe('2g');
  });

  it('retries a transient geo/search failure up to the cap, then surfaces an actionable error', async () => {
    const clock = new FakeClock();
    const sleep = (ms: number): Promise<void> => clock.setTimeout(() => undefined, ms);
    const sim = withNetworkSim(NETWORK_PROFILES.edge, { clock, seed: 3 });

    const op = jest
      .fn<Promise<unknown>, []>()
      .mockRejectedValue(createAppError({ kind: 'Network', message: 'edge dropout' }));

    const run = runWithRetry(() => sim.run(op), { sleep, backoff: [10, 20] }).catch(
      (e: unknown) => e,
    );
    await clock.runAll();
    const error = await run;

    expect(op).toHaveBeenCalledTimes(3); // initial + 2 backoff retries (cap)
    expect((error as { kind: string }).kind).toBe('Network');
    expect(isRetryableError(error)).toBe(true);
  });

  it('does NOT retry an Unauthorized auth failure under a degraded profile', async () => {
    const clock = new FakeClock();
    const sleep = (ms: number): Promise<void> => clock.setTimeout(() => undefined, ms);
    const sim = withNetworkSim(NETWORK_PROFILES['2g'], { clock, seed: 9 });

    const unauthorized = createAppError({
      kind: 'Unauthorized',
      message: 'token expired',
      status: 401,
    });
    expect(isRetryableError(unauthorized)).toBe(false);

    const op = jest.fn<Promise<unknown>, []>().mockRejectedValue(unauthorized);

    const run = runWithRetry(() => sim.run(op), { sleep }).catch((e: unknown) => e);
    await clock.runAll();
    const error = await run;

    expect(op).toHaveBeenCalledTimes(1); // fatal → no retry
    expect((error as { kind: string }).kind).toBe('Unauthorized');
  });

  it('treats a Forbidden (403) auth failure as fatal (not retried)', () => {
    const forbidden = createAppError({ kind: 'Forbidden', message: 'no access', status: 403 });

    expect(isRetryableError(forbidden)).toBe(false);
  });
});
