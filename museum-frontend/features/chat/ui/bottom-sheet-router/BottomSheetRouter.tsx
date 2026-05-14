import type React from 'react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  dispatchBottomSheetEvent,
  resetBottomSheetState,
  subscribeBottomSheetClose,
  subscribeBottomSheetTriggerCapture,
  useBottomSheetState,
} from './bottomSheetStore';
import { BottomSheetContainer, type BottomSheetContainerPhase } from './BottomSheetContainer';
import { ROUTES, type BottomSheetRouteId } from './routes';

interface BottomSheetRouterProps {
  /** Optional callback invoked once a route finishes closing. */
  onRouteClose?: (route: BottomSheetRouteId) => void;
}

/**
 * Single-mount router that hosts the active bottom-sheet route. Reads the
 * module-level store (`bottomSheetStore.ts`) so consumers do not need to wrap
 * their tree in a provider — `useBottomSheetRouter()` reaches the same state
 * from any depth.
 *
 * Behaviour:
 *   - The reducer holds the discrete phase (`opening | open | closing`);
 *     `<BottomSheetContainer>` plays the actual animation and dispatches the
 *     terminal `OPEN_DONE` / `CLOSE_DONE` events when each animation settles.
 *     This decoupling is the spec R12 sequencing — the next route only mounts
 *     once the exit anim has played.
 *   - Mounts the route's `Content` component inside a `<BottomSheetContainer>`
 *     that handles the visual shell, dialog a11y attributes, swipe-down
 *     dismiss (R8), and Android hardware-back wiring (R9).
 *   - Announces the route's `a11yAnnounceKey` (translated) via
 *     `AccessibilityInfo.announceForAccessibility` exactly once per mount
 *     (spec R17).
 *   - Restores screen-reader focus to the element that invoked `open()`
 *     after close, best-effort via `AccessibilityInfo.setAccessibilityFocus`
 *     (spec R15-R16). The call-site MUST supply the trigger node handle in
 *     the `open()` params (via `findNodeHandle(triggerRef.current)`); the
 *     router stores it and replays it after the route closes. When no handle
 *     is provided, the restore is a no-op — there is no automatic capture in
 *     RN 0.83 (no public `getCurrentlyFocusedField` for arbitrary views),
 *     this is documented honestly rather than faked.
 */
export const BottomSheetRouter = ({ onRouteClose }: BottomSheetRouterProps) => {
  const { t } = useTranslation();
  const state = useBottomSheetState();
  const onRouteCloseRef = useRef(onRouteClose);
  // Sync the latest callback into the ref inside a layout effect — accessing
  // `.current` during render is flagged by `react-hooks/refs`.
  useEffect(() => {
    onRouteCloseRef.current = onRouteClose;
  }, [onRouteClose]);

  // Trigger node handle captured at the call-site (R15-R16). We store it
  // alongside the active route so we can replay `setAccessibilityFocus` once
  // the close animation settles. Best-effort: when the value is `null` the
  // restore is skipped silently.
  const triggerTagRef = useRef<number | null>(null);

  // The router state lives in a module-level store so the hook works without
  // a provider tree. When the router itself unmounts (screen pops, e.g.
  // navigation back), clear the store so a future remount starts fresh.
  useEffect(() => {
    return () => {
      resetBottomSheetState();
      triggerTagRef.current = null;
    };
  }, []);

  // Capture trigger handle — the hook publishes it before the OPEN event is
  // dispatched (see `useBottomSheetRouter.open(...)`).
  useEffect(() => {
    return subscribeBottomSheetTriggerCapture((handle) => {
      triggerTagRef.current = handle;
    });
  }, []);

  // Route-close subscription — `<BottomSheetContainer>` dispatches CLOSE_DONE
  // when the exit animation settles; the store fan-outs to listeners with the
  // route id of the just-closed sheet. We restore screen-reader focus here
  // (R16) BEFORE invoking the call-site callback, so the call-site can run
  // its own focus tweaks after if needed.
  useEffect(() => {
    const unsubscribe = subscribeBottomSheetClose((route) => {
      const tag = triggerTagRef.current;
      triggerTagRef.current = null;
      if (tag !== null) {
        AccessibilityInfo.setAccessibilityFocus(tag);
      }
      onRouteCloseRef.current?.(route);
    });
    return unsubscribe;
  }, []);

  // Announce route on mount, exactly once until the route changes.
  const announcedRouteRef = useRef<BottomSheetRouteId | null>(null);
  useEffect(() => {
    if (state.kind === 'opening' || state.kind === 'open') {
      if (announcedRouteRef.current !== state.route) {
        announcedRouteRef.current = state.route;
        const definition = ROUTES[state.route];
        const announceKey = definition?.a11yAnnounceKey;
        if (announceKey) {
          AccessibilityInfo.announceForAccessibility(t(announceKey));
        }
      }
    } else if (state.kind === 'idle') {
      announcedRouteRef.current = null;
    }
  }, [state, t]);

  const handleBackdropPress = useCallback(() => {
    if (state.kind !== 'open' && state.kind !== 'opening') return;
    if (state.blocking) return;
    dispatchBottomSheetEvent({ type: 'CLOSE' });
  }, [state]);

  const handleHardwareBack = useCallback(() => {
    if (state.kind !== 'open' && state.kind !== 'opening') return;
    if (state.blocking) return;
    dispatchBottomSheetEvent({ type: 'CLOSE' });
  }, [state]);

  const closeFromContent = useCallback(() => {
    dispatchBottomSheetEvent({ type: 'CLOSE' });
  }, []);

  return useMemo(() => {
    if (state.kind === 'idle') return null;
    const definition = ROUTES[state.route];
    if (!definition) return null;
    const Content = definition.Content as React.FC<Record<string, unknown> & { close: () => void }>;
    const params = (state.params ?? {}) as Record<string, unknown>;
    const phase: BottomSheetContainerPhase = state.kind;
    const enableSwipeDown = definition.presentation === 'sheet' && !definition.blocking;
    return (
      <BottomSheetContainer
        presentation={definition.presentation}
        enableSwipeDown={enableSwipeDown}
        phase={phase}
        accessibilityLabel={t(definition.a11yAnnounceKey)}
        onBackdropPress={handleBackdropPress}
        onHardwareBack={handleHardwareBack}
      >
        <Content {...params} close={closeFromContent} />
      </BottomSheetContainer>
    );
  }, [state, t, handleBackdropPress, handleHardwareBack, closeFromContent]);
};
