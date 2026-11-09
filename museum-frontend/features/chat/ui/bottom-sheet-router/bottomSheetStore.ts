import { useSyncExternalStore } from 'react';

import {
  bottomSheetReducer,
  type BottomSheetEvent,
  type BottomSheetState,
} from './bottomSheetMachine';
import type { BottomSheetRouteId } from './routes';

type Listener = () => void;

let state: BottomSheetState = { kind: 'idle' };
const listeners = new Set<Listener>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function getBottomSheetState(): BottomSheetState {
  return state;
}

type CloseListener = (route: BottomSheetRouteId) => void;
const closeListeners = new Set<CloseListener>();

export function subscribeBottomSheetClose(listener: CloseListener): () => void {
  closeListeners.add(listener);
  return () => {
    closeListeners.delete(listener);
  };
}

type TriggerCaptureListener = (handle: number | null) => void;
const triggerCaptureListeners = new Set<TriggerCaptureListener>();

export function subscribeBottomSheetTriggerCapture(listener: TriggerCaptureListener): () => void {
  triggerCaptureListeners.add(listener);
  return () => {
    triggerCaptureListeners.delete(listener);
  };
}

export function publishBottomSheetTriggerCapture(handle: number | null): void {
  for (const listener of triggerCaptureListeners) listener(handle);
}

export function dispatchBottomSheetEvent(event: BottomSheetEvent): void {
  const previous = state;
  const next = bottomSheetReducer(previous, event);
  if (next === previous) return;
  state = next;
  notify();
  if (event.type === 'CLOSE_DONE' && previous.kind === 'closing' && next.kind !== 'closing') {
    const route = previous.route;
    for (const listener of closeListeners) listener(route);
  }
}

export function resetBottomSheetState(): void {
  state = { kind: 'idle' };
  notify();
}

export function subscribeBottomSheetState(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useBottomSheetState(): BottomSheetState {
  return useSyncExternalStore(subscribeBottomSheetState, getBottomSheetState, getBottomSheetState);
}
