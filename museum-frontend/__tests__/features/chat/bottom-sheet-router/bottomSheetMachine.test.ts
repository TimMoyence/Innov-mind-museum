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

  describe('R14 — CTA_CLOSE bypasses the blocking gate', () => {
    it('open(consent, blocking) + CTA_CLOSE → closing (the route’s own button always closes)', () => {
      const state: BottomSheetState = {
        kind: 'open',
        route: 'consent',
        params: {},
        blocking: true,
      };
      const event: BottomSheetEvent = { type: 'CTA_CLOSE' };
      const next = bottomSheetReducer(state, event);
      expect(next).toEqual({
        kind: 'closing',
        route: 'consent',
        params: {},
        blocking: true,
        nextQueued: null,
      });
    });

    it('opening(daily-limit, blocking) + CTA_CLOSE → closing (CTA fires before OPEN_DONE settles)', () => {
      const state: BottomSheetState = {
        kind: 'opening',
        route: 'daily-limit',
        params: {},
        blocking: true,
      };
      const event: BottomSheetEvent = { type: 'CTA_CLOSE' };
      const next = bottomSheetReducer(state, event);
      expect(next).toEqual({
        kind: 'closing',
        route: 'daily-limit',
        params: {},
        blocking: true,
        nextQueued: null,
      });
    });

    it('idle + CTA_CLOSE → idle (no route to close)', () => {
      const state: BottomSheetState = { kind: 'idle' };
      const event: BottomSheetEvent = { type: 'CTA_CLOSE' };
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

  describe('no-op events leave the state untouched', () => {
    it('idle + CLOSE → idle (irrelevant event, no transition)', () => {
      const state: BottomSheetState = { kind: 'idle' };
      const next = bottomSheetReducer(state, { type: 'CLOSE' });
      expect(next).toBe(state);
    });

    it('idle + OPEN_DONE → idle', () => {
      const state: BottomSheetState = { kind: 'idle' };
      const next = bottomSheetReducer(state, { type: 'OPEN_DONE' });
      expect(next).toBe(state);
    });

    it('opening(blocking) + OPEN(non-blocking) → unchanged (R6 in flight)', () => {
      const state: BottomSheetState = {
        kind: 'opening',
        route: 'consent',
        params: {},
        blocking: true,
      };
      const next = bottomSheetReducer(state, {
        type: 'OPEN',
        route: 'context-menu',
        params: {},
        blocking: false,
      });
      expect(next).toBe(state);
    });

    it('opening + CLOSE_DONE → opening (irrelevant event)', () => {
      const state: BottomSheetState = {
        kind: 'opening',
        route: 'consent',
        params: {},
        blocking: true,
      };
      const next = bottomSheetReducer(state, { type: 'CLOSE_DONE' });
      expect(next).toBe(state);
    });

    it('open + CLOSE_DONE → open (transition only fires from closing)', () => {
      const state: BottomSheetState = {
        kind: 'open',
        route: 'context-menu',
        params: {},
        blocking: false,
      };
      const next = bottomSheetReducer(state, { type: 'CLOSE_DONE' });
      expect(next).toBe(state);
    });

    it('closing(blocking) + OPEN(non-blocking) → unchanged (R6 even mid-close)', () => {
      const state: BottomSheetState = {
        kind: 'closing',
        route: 'consent',
        params: {},
        blocking: true,
        nextQueued: null,
      };
      const next = bottomSheetReducer(state, {
        type: 'OPEN',
        route: 'context-menu',
        params: {},
        blocking: false,
      });
      expect(next).toBe(state);
    });

    it('closing + CLOSE → closing (CLOSE-while-closing is a no-op)', () => {
      const state: BottomSheetState = {
        kind: 'closing',
        route: 'context-menu',
        params: {},
        blocking: false,
        nextQueued: null,
      };
      const next = bottomSheetReducer(state, { type: 'CLOSE' });
      expect(next).toBe(state);
    });
  });

  describe('closing + OPEN replaces the queued route', () => {
    it('closing(non-blocking) + OPEN(any) → same closing state with new nextQueued', () => {
      const state: BottomSheetState = {
        kind: 'closing',
        route: 'context-menu',
        params: { messageId: 'm1' },
        blocking: false,
        nextQueued: {
          route: 'consent',
          params: { foo: 'old' },
          blocking: true,
        },
      };
      const next = bottomSheetReducer(state, {
        type: 'OPEN',
        route: 'voice-intro',
        params: { foo: 'new' },
        blocking: true,
      });
      expect(next).toEqual({
        kind: 'closing',
        route: 'context-menu',
        params: { messageId: 'm1' },
        blocking: false,
        nextQueued: {
          route: 'voice-intro',
          params: { foo: 'new' },
          blocking: true,
        },
      });
    });
  });
});
