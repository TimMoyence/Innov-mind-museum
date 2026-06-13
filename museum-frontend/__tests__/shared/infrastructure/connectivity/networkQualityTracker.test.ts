/**
 * TR-01 (shell volet) — networkQualityTracker singleton (run
 * undefined-network-detection-reliability, cluster A, task A-R2).
 * Pins design §2.2: Date.now stamped at the edge, AppState gate (D-11 /
 * US-10.2), identity-change reset (US-04.3 / INV-10), notification on
 * transitions ONLY (NFR-02 / design R5), single eviction timer (US-10.4),
 * `__resetNetworkQualityForTests` (NFR-05, pattern currentDataMode).
 */
import { AppState } from 'react-native';

import { QUALITY_STALE_MS } from '@/shared/infrastructure/connectivity/networkQuality';
import {
  getQualityState,
  noteNetworkIdentity,
  recordQualitySample,
  subscribeQualityState,
  __resetNetworkQualityForTests,
} from '@/shared/infrastructure/connectivity/networkQualityTracker';
import { makeQualitySampleInput } from '@/__tests__/helpers/factories/connectivity.factories';

/** The RN jest mock exposes `currentState` as a writable own property. */
const setAppState = (state: string): void => {
  (AppState as unknown as { currentState: string }).currentState = state;
};

/** Records `n` samples spaced 1 s apart (fake clock advanced between records). */
const recordWindow = (n: number, rttMs = 100, ok = true, timedOut = false): void => {
  for (let i = 0; i < n; i += 1) {
    recordQualitySample(makeQualitySampleInput({ rttMs, ok, timedOut }));
    jest.advanceTimersByTime(1000);
  }
};

const CELLULAR_4G = { type: 'cellular', cellularGeneration: '4g', isConnected: true };
const WIFI_ONLINE = { type: 'wifi', cellularGeneration: null, isConnected: true };

describe('networkQualityTracker', () => {
  beforeEach(() => {
    // Order matters: fake the clock FIRST so the reset re-anchors the engine
    // on the fake Date.now (the singleton was created at import time on the
    // real clock).
    jest.useFakeTimers();
    jest.setSystemTime(0);
    __resetNetworkQualityForTests();
    setAppState('active');
  });

  afterEach(() => {
    __resetNetworkQualityForTests();
    jest.useRealTimers();
  });

  it('starts in unknown', () => {
    expect(getQualityState()).toBe('unknown');
  });

  it('notifies exactly once on the unknown→ok transition (NFR-02)', () => {
    const listener = jest.fn();
    subscribeQualityState(listener);

    recordWindow(5);

    expect(getQualityState()).toBe('ok');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith('ok');
  });

  it('N additional samples without a state change ⇒ ZERO additional notifications (design R5)', () => {
    const listener = jest.fn();
    subscribeQualityState(listener);
    recordWindow(5);
    expect(listener).toHaveBeenCalledTimes(1);

    recordWindow(10);

    expect(getQualityState()).toBe('ok');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('ignores samples recorded while AppState is not active (D-11 / US-10.2)', () => {
    const listener = jest.fn();
    subscribeQualityState(listener);

    setAppState('background');
    recordWindow(5, 2000);

    expect(getQualityState()).toBe('unknown');
    expect(listener).not.toHaveBeenCalled();

    setAppState('active');
    recordWindow(5, 2000);

    expect(getQualityState()).toBe('slow');
    expect(listener).toHaveBeenCalledWith('slow');
  });

  it('noteNetworkIdentity with the SAME identity is a no-op (US-04.3)', () => {
    noteNetworkIdentity(CELLULAR_4G);
    recordWindow(5);
    expect(getQualityState()).toBe('ok');

    noteNetworkIdentity(CELLULAR_4G);

    expect(getQualityState()).toBe('ok');
  });

  it('resets to unknown when the network type changes (US-04.3 / INV-10)', () => {
    const listener = jest.fn();
    subscribeQualityState(listener);
    noteNetworkIdentity(WIFI_ONLINE);
    recordWindow(5);
    expect(getQualityState()).toBe('ok');

    noteNetworkIdentity(CELLULAR_4G);

    expect(getQualityState()).toBe('unknown');
    expect(listener).toHaveBeenLastCalledWith('unknown');
  });

  it('resets to unknown when the cellular generation changes (US-04.3)', () => {
    noteNetworkIdentity(CELLULAR_4G);
    recordWindow(5);
    expect(getQualityState()).toBe('ok');

    noteNetworkIdentity({ type: 'cellular', cellularGeneration: '5g', isConnected: true });

    expect(getQualityState()).toBe('unknown');
  });

  it('resets to unknown on reconnection after isConnected=false (US-04.3 / US-07.1)', () => {
    noteNetworkIdentity(WIFI_ONLINE);
    recordWindow(5);
    expect(getQualityState()).toBe('ok');

    noteNetworkIdentity({ type: 'wifi', cellularGeneration: null, isConnected: false });
    noteNetworkIdentity({ type: 'wifi', cellularGeneration: null, isConnected: true });

    expect(getQualityState()).toBe('unknown');
  });

  it('falls back to unknown via the eviction timer when traffic stops (US-10.4)', () => {
    const listener = jest.fn();
    subscribeQualityState(listener);
    recordWindow(5, 2000);
    expect(getQualityState()).toBe('slow');

    // No further traffic: the scheduled eviction must fire on its own.
    jest.advanceTimersByTime(QUALITY_STALE_MS + 5000);

    expect(getQualityState()).toBe('unknown');
    expect(listener).toHaveBeenLastCalledWith('unknown');
  });

  it('keeps a SINGLE pending eviction timer regardless of sample count (design §2.2)', () => {
    recordWindow(5);
    expect(jest.getTimerCount()).toBe(1);
  });

  it('__resetNetworkQualityForTests restores initial state, clears listeners and timer (NFR-05)', () => {
    const listener = jest.fn();
    subscribeQualityState(listener);
    recordWindow(5);
    expect(getQualityState()).toBe('ok');
    expect(listener).toHaveBeenCalledTimes(1);

    __resetNetworkQualityForTests();

    expect(getQualityState()).toBe('unknown');
    expect(jest.getTimerCount()).toBe(0);

    // Listener set was cleared: a new transition must not reach the old listener.
    recordWindow(5);
    expect(getQualityState()).toBe('ok');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('unsubscribe stops notifications', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeQualityState(listener);
    unsubscribe();

    recordWindow(5);

    expect(getQualityState()).toBe('ok');
    expect(listener).not.toHaveBeenCalled();
  });
});
