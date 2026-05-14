import { useMemo } from 'react';

import {
  dispatchBottomSheetEvent,
  publishBottomSheetTriggerCapture,
  useBottomSheetState,
} from './bottomSheetStore';
import { ROUTES, type BottomSheetRouteId, type BottomSheetRouteParams } from './routes';

/**
 * Optional accessibility-focus restore handle.
 *
 * Spec R15-R16 require the router to return screen-reader focus to the
 * element that invoked `open()` after the sheet closes. RN 0.83 has no public
 * API to capture the currently-focused accessibility element for arbitrary
 * views (`AccessibilityInfo.getCurrentlyFocusedField` covers TextInput only),
 * so we ask the call-site to opt-in: pass `triggerNodeHandle =
 * findNodeHandle(triggerRef.current)` and the router will replay
 * `AccessibilityInfo.setAccessibilityFocus(handle)` on close. When `null`
 * (or omitted) the restore is a no-op — best-effort by design, no fake focus.
 */
export interface BottomSheetOpenOptions {
  triggerNodeHandle?: number | null;
}

export interface BottomSheetRouter {
  readonly activeRoute: BottomSheetRouteId | null;
  open: <K extends BottomSheetRouteId>(
    route: K,
    params: BottomSheetRouteParams[K],
    options?: BottomSheetOpenOptions,
  ) => void;
  close: () => void;
}

/**
 * Hook exposing the imperative router API. Reads the active route from the
 * module-level store so it can be called from anywhere — no provider
 * wrapping required. The OPEN event resolves `blocking` from the routes
 * registry to keep the reducer pure (it would otherwise need a registry
 * back-reference to evaluate R6 / R11).
 */
export function useBottomSheetRouter(): BottomSheetRouter {
  const state = useBottomSheetState();

  return useMemo<BottomSheetRouter>(() => {
    const activeRoute: BottomSheetRouteId | null = state.kind === 'idle' ? null : state.route;
    return {
      activeRoute,
      open<K extends BottomSheetRouteId>(
        route: K,
        params: BottomSheetRouteParams[K],
        options?: BottomSheetOpenOptions,
      ): void {
        const definition = ROUTES[route];
        const blocking = definition?.blocking ?? false;
        // Publish the trigger handle BEFORE the OPEN event so the router can
        // store it synchronously (spec R15-R16). `null` is published when the
        // call-site does not opt in, which clears any stale handle from a
        // previous open.
        publishBottomSheetTriggerCapture(options?.triggerNodeHandle ?? null);
        dispatchBottomSheetEvent({
          type: 'OPEN',
          route,
          params: params as unknown,
          blocking,
        });
      },
      close(): void {
        dispatchBottomSheetEvent({ type: 'CLOSE' });
      },
    };
  }, [state]);
}
