import { useCallback, useMemo } from 'react';

import {
  dispatchBottomSheetEvent,
  publishBottomSheetTriggerCapture,
  useBottomSheetState,
} from './bottomSheetStore';
import { ROUTES, type BottomSheetRouteId, type BottomSheetRouteParams } from './routes';

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

export function useBottomSheetRouter(): BottomSheetRouter {
  const state = useBottomSheetState();

  const open = useCallback(
    <K extends BottomSheetRouteId>(
      route: K,
      params: BottomSheetRouteParams[K],
      options?: BottomSheetOpenOptions,
    ): void => {
      const definition = ROUTES[route];
      const blocking = definition?.blocking ?? false;
      publishBottomSheetTriggerCapture(options?.triggerNodeHandle ?? null);
      dispatchBottomSheetEvent({
        type: 'OPEN',
        route,
        params: params as unknown,
        blocking,
      });
    },
    [],
  );

  const close = useCallback((): void => {
    dispatchBottomSheetEvent({ type: 'CLOSE' });
  }, []);

  return useMemo<BottomSheetRouter>(() => {
    const activeRoute: BottomSheetRouteId | null = state.kind === 'idle' ? null : state.route;
    return { activeRoute, open, close };
  }, [state, open, close]);
}
