/**
 * Network-quality tracker — impure singleton shell around the pure engine
 * (`networkQuality.ts`). Mirror of the `currentDataMode.ts:9-41` pattern
 * (module-scoped state + listeners + `__reset…ForTests`, NFR-05).
 *
 * Responsibilities (design §2.2) — everything the pure engine must not do:
 * - stamps `Date.now()` at the edge (INV-06 keeps the engine clock-injected);
 * - gates samples on `AppState.currentState === 'active'` (D-11 / US-10.2 —
 *   an iOS-suspended request would produce a fake giant RTT);
 * - resets the window on network-identity change (US-04.3 / INV-10);
 * - notifies listeners ONLY on state transitions (NFR-02 / design R5 —
 *   anti re-render storm), shaped for `useSyncExternalStore`;
 * - keeps a SINGLE pending eviction timer so a quiet `slow` window falls back
 *   to `unknown` when traffic stops (US-10.4). Plain JS timer — zero radio
 *   wake-up (NFR-03).
 */
import { AppState } from 'react-native';

import {
  addQualitySample,
  evictStaleSamples,
  initialQualityEngineState,
  resetQualityEngine,
  QUALITY_STALE_MS,
  type QualityEngineState,
  type QualityState,
} from './networkQuality';

type QualityListener = (state: QualityState) => void;

/** Identity tuple — any change means "new network" (spec §2 glossary). */
interface NetworkIdentityInput {
  type: string;
  cellularGeneration: string | null;
  isConnected: boolean | null;
}

let engineState: QualityEngineState = initialQualityEngineState(Date.now());
let lastIdentity: NetworkIdentityInput | null = null;
const listeners = new Set<QualityListener>();
let evictionTimer: ReturnType<typeof setTimeout> | null = null;

/** Notifies only when the state actually changed (NFR-02). */
const notifyIfTransition = (previousState: QualityState): void => {
  if (engineState.state === previousState) return;
  for (const listener of listeners) {
    try {
      listener(engineState.state);
    } catch {
      // A faulty subscriber must never break the tracker (pattern currentDataMode.ts:20-26).
    }
  }
};

const clearEvictionTimer = (): void => {
  if (evictionTimer !== null) {
    clearTimeout(evictionTimer);
    evictionTimer = null;
  }
};

const onEvictionTimerFired = (): void => {
  evictionTimer = null;
  const previousState = engineState.state;
  engineState = evictStaleSamples(engineState, Date.now());
  notifyIfTransition(previousState);
  scheduleEviction();
};

/**
 * (Re)schedules THE single eviction timer on the next staleness boundary
 * (`oldestSample.atMs + QUALITY_STALE_MS`). No samples ⇒ no timer. Lazy
 * eviction inside `getQualityState()` was rejected: `useSyncExternalStore`
 * snapshots must be side-effect free and stable between renders (design §2.2).
 */
const scheduleEviction = (): void => {
  clearEvictionTimer();
  const oldest = engineState.samples[0];
  if (!oldest) return;
  const delayMs = Math.max(oldest.atMs + QUALITY_STALE_MS - Date.now(), 0);
  evictionTimer = setTimeout(onEvictionTimerFired, delayMs);
};

/**
 * Records a passive sample from the axios edge (`qualitySampling.ts`). Stamps
 * `Date.now()` here; IGNORED while the app is not active (D-11 / US-10.2).
 */
export function recordQualitySample(input: {
  rttMs: number;
  ok: boolean;
  timedOut: boolean;
}): void {
  if (AppState.currentState !== 'active') return;
  const previousState = engineState.state;
  engineState = addQualitySample(engineState, {
    rttMs: input.rttMs,
    ok: input.ok,
    timedOut: input.timedOut,
    atMs: Date.now(),
  });
  notifyIfTransition(previousState);
  scheduleEviction();
}

/**
 * Feeds the current network identity (DataModeProvider effect). Resets the
 * engine when `type`/`cellularGeneration` change, or when `isConnected` comes
 * back `true` after an explicit `false` (reconnection cycle — US-04.3 /
 * US-07.1). Same identity ⇒ no-op.
 */
export function noteNetworkIdentity(id: NetworkIdentityInput): void {
  const previous = lastIdentity;
  lastIdentity = {
    type: id.type,
    cellularGeneration: id.cellularGeneration,
    isConnected: id.isConnected,
  };
  if (previous === null) return;

  const identityChanged =
    previous.type !== id.type || previous.cellularGeneration !== id.cellularGeneration;
  const reconnected = previous.isConnected === false && id.isConnected === true;
  if (!identityChanged && !reconnected) return;

  const previousState = engineState.state;
  engineState = resetQualityEngine(Date.now());
  notifyIfTransition(previousState);
  scheduleEviction(); // empty window ⇒ clears the pending timer
}

/** Stable snapshot for `useSyncExternalStore` — side-effect free (design §2.2). */
export function getQualityState(): QualityState {
  return engineState.state;
}

/** Subscribes to quality-state TRANSITIONS only. Returns the unsubscribe. */
export function subscribeQualityState(listener: QualityListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test-only: pristine engine + cleared listeners, identity and timer (NFR-05). */
export function __resetNetworkQualityForTests(): void {
  clearEvictionTimer();
  engineState = initialQualityEngineState(Date.now());
  lastIdentity = null;
  listeners.clear();
}
