/**
 * RED tests for bug_010 (ultrareview cloud, 2026-05-15) — BottomSheetRouter
 * chained `closing → opening(queued)` replace stalls because `<BottomSheetContainer>`
 * is reused (no `key` prop in `BottomSheetRouter.tsx`) and its mount-only
 * entrance `useEffect` never re-fires for the new route.
 *
 * Symptoms covered by these tests:
 *   1. Reducer never reaches `open` for the queued route — it stays wedged in
 *      `opening(B)` because `OPEN_DONE` is never dispatched.
 *   2. The entrance `Animated.timing` calls (opacity + translateY) for the
 *      queued route never fire (mount-only effect with `[]` deps does not
 *      re-run on logical remount when React reconciles the same instance).
 *   3. `OPEN_DONE` is dispatched exactly once across the whole chained-replace
 *      sequence (only for the first route), not twice.
 *
 * Fix (R2 / B4 cartel-scanner): add `key={state.route}` on `<BottomSheetContainer>`
 * in `BottomSheetRouter.tsx`. The route id flip forces React to unmount the
 * previous container and mount a new one, which fires the entrance effect and
 * dispatches `OPEN_DONE` to settle the reducer at `open(queuedRoute)`.
 */

import React from 'react';
import { Animated } from 'react-native';
import { act, render } from '@testing-library/react-native';

import '../../../helpers/test-utils';

jest.mock('@/shared/ui/hooks/useReducedMotion', () => ({
  useReducedMotion: () => false,
}));

import {
  dispatchBottomSheetEvent,
  getBottomSheetState,
} from '@/features/chat/ui/bottom-sheet-router/bottomSheetStore';

import { installMockRoutes, RouterTestHost, type RouterHandle } from './test-harness';

describe('BottomSheetRouter — bug_010 chained replace settles cleanly', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    installMockRoutes();
  });

  it('reducer settles to `open` on the queued route after chained replace', () => {
    jest.useFakeTimers();

    const ref = React.createRef<RouterHandle>();
    render(<RouterTestHost ref={ref} />);

    // Open route A (non-blocking, sheet).
    act(() => {
      ref.current?.open('context-menu', { message: { id: 'first' } });
    });
    act(() => {
      jest.runAllTimers();
    });
    expect(getBottomSheetState().kind).toBe('open');

    // Chained replace: open route B while A is `open` → reducer goes through
    // `closing(A, queued=B)` then on CLOSE_DONE → `opening(B)`. After the
    // entrance animation of B settles, it must reach `open(B)`.
    act(() => {
      ref.current?.open('consent', {});
    });

    // Drain exit anim of A (CLOSE_DONE) → reducer enters `opening('consent')`.
    act(() => {
      jest.runAllTimers();
    });
    // Drain entrance anim of B → OPEN_DONE must dispatch and reducer reach
    // `open('consent')`. With the bug, the BottomSheetContainer instance is
    // reused (no `key` prop) and its mount-only entrance effect does NOT
    // re-fire — `OPEN_DONE` is never dispatched and the reducer is wedged in
    // `opening('consent')` forever.
    act(() => {
      jest.runAllTimers();
    });

    const state = getBottomSheetState();
    expect(state.kind).toBe('open');
    if (state.kind === 'open' || state.kind === 'opening') {
      expect(state.route).toBe('consent');
    }
  });

  it('runs the entrance animation parallel block for the queued route (container remounted)', () => {
    jest.useFakeTimers();
    // `Animated.parallel` is invoked exactly once per (entrance | exit) phase
    // inside `BottomSheetContainer`. Counting it deflakes the test from any
    // changes inside Backdrop / other ancillary Animated.timing emitters.
    const parallelSpy = jest.spyOn(Animated, 'parallel');

    const ref = React.createRef<RouterHandle>();
    render(<RouterTestHost ref={ref} />);

    // Phase 1 — open route A. Entrance `Animated.parallel` runs once.
    act(() => {
      ref.current?.open('context-menu', { message: { id: 'first' } });
    });
    act(() => {
      jest.runAllTimers();
    });
    // Baseline: 1 entrance parallel.
    const afterOpenA = parallelSpy.mock.calls.length;
    expect(afterOpenA).toBe(1);

    // Phase 2 — chained replace with route B.
    //   - exit anim of A runs → `Animated.parallel` #2.
    //   - reducer enters `opening(B)`.
    //   - WITH FIX (key={state.route}): new container instance mounts → entrance
    //     anim of B runs → `Animated.parallel` #3.
    //   - WITH BUG (no key): same container instance reused → entrance
    //     useEffect (deps `[]`) does NOT re-fire → only 2 parallel calls total.
    act(() => {
      ref.current?.open('consent', {});
    });
    act(() => {
      jest.runAllTimers();
    });
    act(() => {
      jest.runAllTimers();
    });

    expect(parallelSpy.mock.calls.length).toBe(3);

    parallelSpy.mockRestore();
    jest.useRealTimers();
  });

  it('dispatches OPEN_DONE for the queued route (not just the first)', () => {
    jest.useFakeTimers();

    // Spy on the store dispatcher by wrapping it. We import the real module
    // and replace the export reference on its module record? jest.spyOn on
    // module exports does not work for re-export bindings. Instead, observe
    // the EFFECT of OPEN_DONE: the reducer transitions through
    //   idle → opening(A) → open(A) → closing(A, queued=B) → opening(B) → open(B)
    // Each `open` phase is the post-condition of an `OPEN_DONE` dispatch.
    // We assert each transition deterministically by sampling state after
    // each timer drain.

    const ref = React.createRef<RouterHandle>();
    render(<RouterTestHost ref={ref} />);

    act(() => {
      ref.current?.open('context-menu', { message: { id: 'first' } });
    });
    // After drain #1, state MUST be `open(context-menu)`.
    act(() => {
      jest.runAllTimers();
    });
    expect(getBottomSheetState().kind).toBe('open');

    act(() => {
      ref.current?.open('consent', {});
    });
    // After drain #2 (exit anim of A), state MUST be `opening(consent)`.
    act(() => {
      jest.runAllTimers();
    });
    expect(getBottomSheetState().kind).toBe('opening');

    // After drain #3 (entrance anim of B), state MUST be `open(consent)`.
    // BUG: this drain has no scheduled timers to flush (the entrance effect
    // for B never ran because the container instance was reused), so the
    // reducer remains in `opening(consent)` — OPEN_DONE never dispatched for B.
    act(() => {
      jest.runAllTimers();
    });
    expect(getBottomSheetState().kind).toBe('open');

    jest.useRealTimers();
  });
});
