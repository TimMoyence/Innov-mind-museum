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
  onRouteClose?: (route: BottomSheetRouteId) => void;
}

export const BottomSheetRouter = ({ onRouteClose }: BottomSheetRouterProps) => {
  const { t } = useTranslation();
  const state = useBottomSheetState();
  const onRouteCloseRef = useRef(onRouteClose);
  useEffect(() => {
    onRouteCloseRef.current = onRouteClose;
  }, [onRouteClose]);

  const triggerTagRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      resetBottomSheetState();
      triggerTagRef.current = null;
    };
  }, []);

  useEffect(() => {
    return subscribeBottomSheetTriggerCapture((handle) => {
      triggerTagRef.current = handle;
    });
  }, []);

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

  const closeUnlessBlocking = useCallback(() => {
    if (state.kind !== 'open' && state.kind !== 'opening') return;
    if (state.blocking) return;
    dispatchBottomSheetEvent({ type: 'CLOSE' });
  }, [state]);

  const closeFromContent = useCallback(() => {
    dispatchBottomSheetEvent({ type: 'CTA_CLOSE' });
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
        key={state.route}
        presentation={definition.presentation}
        enableSwipeDown={enableSwipeDown}
        phase={phase}
        accessibilityLabel={t(definition.a11yAnnounceKey)}
        onBackdropPress={closeUnlessBlocking}
        onHardwareBack={closeUnlessBlocking}
      >
        <Content {...params} close={closeFromContent} />
      </BottomSheetContainer>
    );
  }, [state, t, closeUnlessBlocking, closeFromContent]);
};
