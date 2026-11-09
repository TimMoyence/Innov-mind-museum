import type { BottomSheetRouteId } from './routes';

export type { BottomSheetRouteId };

export interface PendingRoute {
  route: BottomSheetRouteId;
  params: unknown;
  blocking: boolean;
}

export type BottomSheetState =
  | { kind: 'idle' }
  | { kind: 'opening'; route: BottomSheetRouteId; params: unknown; blocking: boolean }
  | { kind: 'open'; route: BottomSheetRouteId; params: unknown; blocking: boolean }
  | {
      kind: 'closing';
      route: BottomSheetRouteId;
      params: unknown;
      blocking: boolean;
      nextQueued: PendingRoute | null;
    };

export type BottomSheetEvent =
  | { type: 'OPEN'; route: BottomSheetRouteId; params: unknown; blocking: boolean }
  | { type: 'OPEN_DONE' }
  | { type: 'CLOSE' }
  | { type: 'CTA_CLOSE' }
  | { type: 'CLOSE_DONE' };

export function bottomSheetReducer(
  state: BottomSheetState,
  event: BottomSheetEvent,
): BottomSheetState {
  switch (state.kind) {
    case 'idle': {
      if (event.type === 'OPEN') {
        return {
          kind: 'opening',
          route: event.route,
          params: event.params,
          blocking: event.blocking,
        };
      }
      return state;
    }

    case 'opening': {
      if (event.type === 'OPEN_DONE') {
        return {
          kind: 'open',
          route: state.route,
          params: state.params,
          blocking: state.blocking,
        };
      }
      if (event.type === 'OPEN') {
        if (state.blocking && !event.blocking) return state;
        return {
          kind: 'closing',
          route: state.route,
          params: state.params,
          blocking: state.blocking,
          nextQueued: {
            route: event.route,
            params: event.params,
            blocking: event.blocking,
          },
        };
      }
      if (event.type === 'CLOSE') {
        if (state.blocking) return state;
        return {
          kind: 'closing',
          route: state.route,
          params: state.params,
          blocking: state.blocking,
          nextQueued: null,
        };
      }
      if (event.type === 'CTA_CLOSE') {
        return {
          kind: 'closing',
          route: state.route,
          params: state.params,
          blocking: state.blocking,
          nextQueued: null,
        };
      }
      return state;
    }

    case 'open': {
      if (event.type === 'OPEN') {
        if (state.blocking && !event.blocking) return state;
        return {
          kind: 'closing',
          route: state.route,
          params: state.params,
          blocking: state.blocking,
          nextQueued: {
            route: event.route,
            params: event.params,
            blocking: event.blocking,
          },
        };
      }
      if (event.type === 'CLOSE') {
        if (state.blocking) return state;
        return {
          kind: 'closing',
          route: state.route,
          params: state.params,
          blocking: state.blocking,
          nextQueued: null,
        };
      }
      if (event.type === 'CTA_CLOSE') {
        return {
          kind: 'closing',
          route: state.route,
          params: state.params,
          blocking: state.blocking,
          nextQueued: null,
        };
      }
      return state;
    }

    case 'closing': {
      if (event.type === 'CLOSE_DONE') {
        const queued = state.nextQueued;
        if (queued !== null) {
          return {
            kind: 'opening',
            route: queued.route,
            params: queued.params,
            blocking: queued.blocking,
          };
        }
        return { kind: 'idle' };
      }
      if (event.type === 'OPEN') {
        if (state.blocking && !event.blocking) return state;
        return {
          ...state,
          nextQueued: {
            route: event.route,
            params: event.params,
            blocking: event.blocking,
          },
        };
      }
      return state;
    }

    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}
