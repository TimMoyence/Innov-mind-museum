/**
 * Red tests for the pure `bottomSheetReducer` (C4 / AC3).
 *
 * No React, no RN imports — pure data-in / data-out. These tests exercise
 * the full transition graph documented in `docs/chat-ux-refonte/specs/C4.md`
 * §1.2 (R1-R12) and §2.3 (state machine signature).
 *
 * DESIGN DECISION recorded by red-test-agent for green-code-agent:
 *
 * The spec's `BottomSheetState` (§2.3) does NOT carry `blocking` on the
 * `'open' | 'opening' | 'closing'` variants. That means the reducer, on its
 * own, cannot evaluate R6 ("blocking route refuses non-blocking open") nor
 * R11 ("blocking route ignores CLOSE without CTA") — it would need to
 * re-look-up `ROUTES[state.route].blocking`. To keep the reducer pure
 * (testable under Node test runner without dragging the routes registry),
 * we extend the state variants with a `blocking: boolean` field captured
 * from the OPEN event. The reducer thus has all the context it needs.
 *
 * Concretely, the expected state shape is:
 *   { kind: 'idle' }
 *   { kind: 'opening', route, params, blocking }
 *   { kind: 'open',    route, params, blocking }
 *   { kind: 'closing', route, params, blocking, nextQueued: { route, params, blocking } | null }
 *
 * If green-code-agent disagrees and prefers to inject `currentBlocking`
 * via event payload instead, please update these tests AND the spec §2.3
 * in a coordinated commit. Either path satisfies AC3 — the important
 * invariant is that the reducer can decide R6/R11 in isolation.
 */

import {
  bottomSheetReducer,
  type BottomSheetState,
  type BottomSheetEvent,
} from '@/features/chat/ui/bottom-sheet-router/bottomSheetMachine';

describe('bottomSheetReducer', () => {
  describe('R1 — opening from idle', () => {
    it('transitions idle → opening on OPEN event', () => {
      const state: BottomSheetState = { kind: 'idle' };
      const event: BottomSheetEvent = {
        type: 'OPEN',
        route: 'consent',
        params: {},
        blocking: true,
      };
      const next = bottomSheetReducer(state, event);
      expect(next).toEqual({
        kind: 'opening',
        route: 'consent',
        params: {},
        blocking: true,
      });
    });

    it('transitions opening → open on OPEN_DONE event', () => {
      const state: BottomSheetState = {
        kind: 'opening',
        route: 'consent',
        params: {},
        blocking: true,
      };
      const event: BottomSheetEvent = { type: 'OPEN_DONE' };
      const next = bottomSheetReducer(state, event);
      expect(next).toEqual({
        kind: 'open',
        route: 'consent',
        params: {},
        blocking: true,
      });
    });
  });

  describe('R6 — blocking route refuses non-blocking OPEN', () => {
    it('keeps daily-limit (blocking) open when context-menu (non-blocking) OPEN arrives', () => {
      const state: BottomSheetState = {
        kind: 'open',
        route: 'daily-limit',
        params: {},
        blocking: true,
      };
      const event: BottomSheetEvent = {
        type: 'OPEN',
        route: 'context-menu',
        params: { message: { id: 'msg-1' } },
        blocking: false,
      };
      const next = bottomSheetReducer(state, event);
      expect(next).toEqual(state);
    });
  });

  describe('R2 / R12 — last-write-wins replace between non-blocking routes', () => {
    it('open(context-menu) then OPEN(summary) → closing(context-menu, nextQueued=summary)', () => {
      const state: BottomSheetState = {
        kind: 'open',
        route: 'context-menu',
        params: { message: { id: 'msg-1' } },
        blocking: false,
      };
      const event: BottomSheetEvent = {
        type: 'OPEN',
        route: 'summary',
        params: { summary: { museumName: null } },
        blocking: false,
      };
      const next = bottomSheetReducer(state, event);
      expect(next).toEqual({
        kind: 'closing',
        route: 'context-menu',
        params: { message: { id: 'msg-1' } },
        blocking: false,
        nextQueued: {
          route: 'summary',
          params: { summary: { museumName: null } },
          blocking: false,
        },
      });
    });
  });

  describe('R12 — chained transition after close', () => {
    it('closing → opening(nextQueued) on CLOSE_DONE when nextQueued is set', () => {
      const state: BottomSheetState = {
        kind: 'closing',
        route: 'context-menu',
        params: { message: { id: 'msg-1' } },
        blocking: false,
        nextQueued: {
          route: 'summary',
          params: { summary: { museumName: 'Louvre' } },
          blocking: false,
        },
      };
      const event: BottomSheetEvent = { type: 'CLOSE_DONE' };
      const next = bottomSheetReducer(state, event);
      expect(next).toEqual({
        kind: 'opening',
        route: 'summary',
        params: { summary: { museumName: 'Louvre' } },
        blocking: false,
      });
    });

    it('closing → idle on CLOSE_DONE when nextQueued is null', () => {
      const state: BottomSheetState = {
        kind: 'closing',
        route: 'context-menu',
        params: { message: { id: 'msg-1' } },
        blocking: false,
        nextQueued: null,
      };
      const event: BottomSheetEvent = { type: 'CLOSE_DONE' };
      const next = bottomSheetReducer(state, event);
      expect(next).toEqual({ kind: 'idle' });
    });
  });

  describe('R11 — blocking route refuses CLOSE event (no-CTA path)', () => {
    it('keeps consent open when CLOSE event arrives (only CTA can close blocking)', () => {
      const state: BottomSheetState = {
        kind: 'open',
        route: 'consent',
        params: {},
        blocking: true,
      };
      const event: BottomSheetEvent = { type: 'CLOSE' };
      const next = bottomSheetReducer(state, event);
      expect(next).toEqual(state);
    });
  });

  describe('R7 / R10 — non-blocking route accepts CLOSE', () => {
    it('open(context-menu) + CLOSE → closing(context-menu, nextQueued=null)', () => {
      const state: BottomSheetState = {
        kind: 'open',
        route: 'context-menu',
        params: { message: { id: 'msg-1' } },
        blocking: false,
      };
      const event: BottomSheetEvent = { type: 'CLOSE' };
      const next = bottomSheetReducer(state, event);
      expect(next).toEqual({
        kind: 'closing',
        route: 'context-menu',
        params: { message: { id: 'msg-1' } },
        blocking: false,
        nextQueued: null,
      });
    });
  });
});
