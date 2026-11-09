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

interface NetworkIdentityInput {
  type: string;
  cellularGeneration: string | null;
  isConnected: boolean | null;
}

let engineState: QualityEngineState = initialQualityEngineState(Date.now());
let lastIdentity: NetworkIdentityInput | null = null;
const listeners = new Set<QualityListener>();
let evictionTimer: ReturnType<typeof setTimeout> | null = null;

const notifyIfTransition = (previousState: QualityState): void => {
  if (engineState.state === previousState) return;
  for (const listener of listeners) {
    try {
      listener(engineState.state);
    } catch {}
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

const scheduleEviction = (): void => {
  clearEvictionTimer();
  const oldest = engineState.samples[0];
  if (!oldest) return;
  const delayMs = Math.max(oldest.atMs + QUALITY_STALE_MS - Date.now(), 0);
  evictionTimer = setTimeout(onEvictionTimerFired, delayMs);
};

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
  scheduleEviction();
}

export function getQualityState(): QualityState {
  return engineState.state;
}

export function subscribeQualityState(listener: QualityListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function __resetNetworkQualityForTests(): void {
  clearEvictionTimer();
  engineState = initialQualityEngineState(Date.now());
  lastIdentity = null;
  listeners.clear();
}
