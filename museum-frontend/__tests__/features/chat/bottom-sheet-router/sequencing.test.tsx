/**
 * Tests for R12 animation sequencing — the reducer's `OPEN_DONE` / `CLOSE_DONE`
 * transitions are now driven by `<BottomSheetContainer>` AFTER each
 * `Animated.timing` settles, not synchronously inside the store dispatcher.
 *
 * This decoupling ensures that when a non-blocking sheet is replaced by
 * another non-blocking sheet (R2 last-write-wins), the visual sequence is
 *   exit-anim(current) → mount(next) → enter-anim(next)
 * with no overlap. Before the fix the state machine collapsed both events
 * into the same tick and the new content mounted while the old was still
 * mid-exit.
 */

import React from 'react';
import { Animated } from 'react-native';
import { act, render } from '@testing-library/react-native';

import '../../../helpers/test-utils';

jest.mock('@/shared/ui/hooks/useReducedMotion', () => ({
  useReducedMotion: () => false,
}));

import { installMockRoutes, RouterTestHost, type RouterHandle } from './test-harness';

describe('BottomSheetRouter — R12 animation sequencing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    installMockRoutes();
  });

  it('open() leaves the reducer in `opening` until Animated.timing callback resolves', () => {
    jest.useFakeTimers();
    const timingSpy = jest.spyOn(Animated, 'timing');

    const ref = React.createRef<RouterHandle>();
    const view = render(<RouterTestHost ref={ref} />);

    act(() => {
      ref.current?.open('context-menu', { message: { id: 'msg-1' } });
    });

    // Entrance Animated.timing was scheduled but its callback has NOT fired
    // yet — the reducer should still be in `opening`, content still mounted.
    expect(timingSpy).toHaveBeenCalled();
    expect(view.getByLabelText('messageMenu.cancel')).toBeTruthy();
    // activeRoute is set as soon as state leaves `idle`.
    expect(ref.current?.activeRoute).toBe('context-menu');

    // Drain the timing → OPEN_DONE dispatches → state becomes `open`.
    act(() => {
      jest.runAllTimers();
    });

    expect(view.getByLabelText('messageMenu.cancel')).toBeTruthy();
    expect(ref.current?.activeRoute).toBe('context-menu');

    timingSpy.mockRestore();
    jest.useRealTimers();
  });

  it('close() keeps content mounted while exit anim is in-flight; CLOSE_DONE fires after timing settles', () => {
    jest.useFakeTimers();

    const ref = React.createRef<RouterHandle>();
    const view = render(<RouterTestHost ref={ref} />);

    act(() => {
      ref.current?.open('context-menu', { message: { id: 'msg-1' } });
    });
    act(() => {
      jest.runAllTimers();
    });

    act(() => {
      ref.current?.close();
    });
    // The reducer is in `closing` — the Container plays the exit anim, content
    // is still rendered (so VoiceOver can announce the close transition).
    expect(view.getByLabelText('messageMenu.cancel')).toBeTruthy();
    expect(ref.current?.activeRoute).toBe('context-menu');

    // Drain exit timing → CLOSE_DONE → state `idle`.
    act(() => {
      jest.runAllTimers();
    });

    expect(view.queryByLabelText('messageMenu.cancel')).toBeNull();
    expect(ref.current?.activeRoute).toBeNull();

    jest.useRealTimers();
  });

  it('replace pattern: queued route mounts only AFTER the exit anim of the previous route', () => {
    jest.useFakeTimers();

    const ref = React.createRef<RouterHandle>();
    const view = render(<RouterTestHost ref={ref} />);

    act(() => {
      ref.current?.open('context-menu', { message: { id: 'first' } });
    });
    act(() => {
      jest.runAllTimers();
    });
    expect(view.getByLabelText('messageMenu.cancel')).toBeTruthy();

    // Second open while the first is `open` → state `closing(first, queued=second)`.
    // The Container should still render the FIRST route while it animates out.
    // Spec R12 — the new route mounts only once the exit anim settles.
    act(() => {
      ref.current?.open('consent', {});
    });

    // Mid-transition: still the first route's content rendered.
    expect(view.getByLabelText('messageMenu.cancel')).toBeTruthy();
    expect(view.queryByLabelText('consent.accept')).toBeNull();

    // First runAllTimers — exit anim of first settles → CLOSE_DONE →
    // reducer `closing(queued) → opening(second)`. Now Container is
    // remounted with the second route; its mount-time entrance anim runs.
    act(() => {
      jest.runAllTimers();
    });
    // Second drain → entrance anim of second settles → OPEN_DONE → state `open(second)`.
    act(() => {
      jest.runAllTimers();
    });

    expect(view.queryByLabelText('messageMenu.cancel')).toBeNull();
    expect(view.getByLabelText('consent.accept')).toBeTruthy();

    jest.useRealTimers();
  });
});
