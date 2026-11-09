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

    expect(timingSpy).toHaveBeenCalled();
    expect(view.getByLabelText('messageMenu.cancel')).toBeTruthy();
    expect(ref.current?.activeRoute).toBe('context-menu');

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
    expect(view.getByLabelText('messageMenu.cancel')).toBeTruthy();
    expect(ref.current?.activeRoute).toBe('context-menu');

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

    act(() => {
      ref.current?.open('consent', {});
    });

    expect(view.getByLabelText('messageMenu.cancel')).toBeTruthy();
    expect(view.queryByLabelText('consent.accept')).toBeNull();

    act(() => {
      jest.runAllTimers();
    });
    act(() => {
      jest.runAllTimers();
    });

    expect(view.queryByLabelText('messageMenu.cancel')).toBeNull();
    expect(view.getByLabelText('consent.accept')).toBeTruthy();

    jest.useRealTimers();
  });
});
