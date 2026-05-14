import { useSyncExternalStore } from 'react';

import {
  bottomSheetReducer,
  type BottomSheetEvent,
  type BottomSheetState,
} from './bottomSheetMachine';
import type { BottomSheetRouteId } from './routes';

/**
 * Module-level store driving the bottom-sheet router state machine. Lives
 * outside React so:
 *   - the `useBottomSheetRouter()` hook can return a stable, app-wide API
 *     without requiring callers to be wrapped in a provider tree;
 *   - the `<BottomSheetRouter />` component can be mounted as a sibling of
 *     the call-sites (the spec mounts it at the bottom of `<LiquidScreen>`
 *     while consumer screens dispatch from much deeper in the tree).
 *
 * The store is intentionally minimal — no middlewares, no devtools. The
 * reducer in `bottomSheetMachine.ts` is the source of truth; this file is
 * just the React-binding shell.
 */

type Listener = () => void;

let state: BottomSheetState = { kind: 'idle' };
const listeners = new Set<Listener>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function getBottomSheetState(): BottomSheetState {
  return state;
}

/**
 * Listeners notified when a `closing` transition completes. The router
 * registers here so it can fire `onRouteClose(routeId)` on the way out
 * without polluting the pure reducer with side-effect plumbing.
 */
type CloseListener = (route: BottomSheetRouteId) => void;
const closeListeners = new Set<CloseListener>();

export function subscribeBottomSheetClose(listener: CloseListener): () => void {
  closeListeners.add(listener);
  return () => {
    closeListeners.delete(listener);
  };
}

/**
 * Trigger capture channel (spec R15-R16). The `useBottomSheetRouter()` hook
 * publishes the call-site's `triggerNodeHandle` (from `findNodeHandle(...)`)
 * BEFORE dispatching the OPEN event so the router can store it and replay
 * `AccessibilityInfo.setAccessibilityFocus` on close. Decoupled from the
 * reducer so the state machine stays pure (handle is an opaque number, not
 * part of the state shape).
 *
 * Best-effort by design: there is no public RN 0.83 API to capture the
 * currently-focused accessibility element for arbitrary views. We document
 * this honestly and require the call-site to opt-in by passing a ref handle.
 * Without a handle the close path is a no-op — no fake focus restore.
 */
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
  // Spec R12: when a `closing` transition resolves (via CLOSE_DONE dispatched
  // by `<BottomSheetContainer>` once the exit animation finishes), notify the
  // route-close listeners so the screen can hook side-effects. We detect the
  // boundary `closing → !closing` here — the route being closed is carried by
  // the PREVIOUS state. Under reduced-motion the Container snaps and still
  // dispatches CLOSE_DONE synchronously, preserving deterministic ordering.
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
