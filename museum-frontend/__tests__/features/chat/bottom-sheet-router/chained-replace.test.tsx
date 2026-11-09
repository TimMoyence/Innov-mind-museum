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

    act(() => {
      ref.current?.open('context-menu', { message: { id: 'first' } });
    });
    act(() => {
      jest.runAllTimers();
    });
    expect(getBottomSheetState().kind).toBe('open');

    act(() => {
      ref.current?.open('consent', {});
    });

    act(() => {
      jest.runAllTimers();
    });
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
    const parallelSpy = jest.spyOn(Animated, 'parallel');

    const ref = React.createRef<RouterHandle>();
    render(<RouterTestHost ref={ref} />);

    act(() => {
      ref.current?.open('context-menu', { message: { id: 'first' } });
    });
    act(() => {
      jest.runAllTimers();
    });
    const afterOpenA = parallelSpy.mock.calls.length;
    expect(afterOpenA).toBe(1);

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

    const ref = React.createRef<RouterHandle>();
    render(<RouterTestHost ref={ref} />);

    act(() => {
      ref.current?.open('context-menu', { message: { id: 'first' } });
    });
    act(() => {
      jest.runAllTimers();
    });
    expect(getBottomSheetState().kind).toBe('open');

    act(() => {
      ref.current?.open('consent', {});
    });
    act(() => {
      jest.runAllTimers();
    });
    expect(getBottomSheetState().kind).toBe('opening');

    act(() => {
      jest.runAllTimers();
    });
    expect(getBottomSheetState().kind).toBe('open');

    jest.useRealTimers();
  });
});
