import type { BottomSheetRouteId } from './routes';

export type { BottomSheetRouteId };

/**
 * Pending route descriptor used both as a `queued` slot inside the `closing`
 * state and as the OPEN event payload.
 */
export interface PendingRoute {
  route: BottomSheetRouteId;
  params: unknown;
  blocking: boolean;
}

/**
 * Pure state shape for the bottom-sheet router. `blocking` is captured on the
 * OPEN event so the reducer can evaluate R6 / R11 in isolation, without
 * looking up the routes registry. See spec §2.3 and the red-test design note.
 */
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
  | { type: 'CLOSE_DONE' };

/**
 * Pure reducer driving the bottom-sheet router lifecycle.
 *
 * Invariants:
 * - R1: `idle + OPEN` → `opening`.
 * - R2 / R12: `open(non-blocking) + OPEN(any)` → `closing(prev, nextQueued=new)`.
 *   Last-write-wins replace even when both are blocking — per integration test.
 * - R6: `open(blocking) + OPEN(non-blocking)` → unchanged. Blocking sheet wins.
 * - R7 / R10: `open(non-blocking) + CLOSE` → `closing(prev, nextQueued=null)`.
 * - R11: `open(blocking) + CLOSE` → unchanged. Only the route's CTA can close.
 * - R12: `closing + CLOSE_DONE` → `opening(queued)` if queued, else `idle`.
 */
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
      // OPEN while opening: replace target via closing path. Treat current as
      // "to-be-closed" with the new one queued.
      if (event.type === 'OPEN') {
        // Blocking sheet refuses non-blocking opener.
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
      return state;
    }

    case 'open': {
      if (event.type === 'OPEN') {
        // R6: blocking active sheet refuses non-blocking opener.
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
        // R11: blocking sheet ignores CLOSE event (CTA path is separate).
        if (state.blocking) return state;
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
      // Replace queued if another OPEN arrives mid-close.
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
