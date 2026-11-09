import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { act, render } from '@testing-library/react-native';

import '../../../helpers/test-utils';

jest.mock('@/shared/ui/hooks/useReducedMotion', () => ({
  useReducedMotion: () => false,
}));

import { installMockRoutes, RouterTestHost, type RouterHandle } from './test-harness';

describe('BottomSheetRouter — focus capture & restore (R15 / R16)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    installMockRoutes();
  });

  it('calls AccessibilityInfo.setAccessibilityFocus(triggerNodeHandle) on close', () => {
    jest.useFakeTimers();
    const focusSpy = jest
      .spyOn(AccessibilityInfo, 'setAccessibilityFocus')
      .mockImplementation(() => undefined);

    const ref = React.createRef<RouterHandle>();
    const view = render(<RouterTestHost ref={ref} />);

    act(() => {
      ref.current?.open('context-menu', { message: { id: 'msg-1' } }, { triggerNodeHandle: 4242 });
    });
    act(() => {
      jest.runAllTimers();
    });
    expect(view.getByLabelText('messageMenu.cancel')).toBeTruthy();
    expect(focusSpy).not.toHaveBeenCalled();

    act(() => {
      ref.current?.close();
    });
    act(() => {
      jest.runAllTimers();
    });

    expect(focusSpy).toHaveBeenCalledTimes(1);
    expect(focusSpy).toHaveBeenCalledWith(4242);

    focusSpy.mockRestore();
    jest.useRealTimers();
  });

  it('does NOT call setAccessibilityFocus when no triggerNodeHandle was provided', () => {
    jest.useFakeTimers();
    const focusSpy = jest
      .spyOn(AccessibilityInfo, 'setAccessibilityFocus')
      .mockImplementation(() => undefined);

    const ref = React.createRef<RouterHandle>();
    const view = render(<RouterTestHost ref={ref} />);

    act(() => {
      ref.current?.open('context-menu', { message: { id: 'msg-2' } });
    });
    act(() => {
      jest.runAllTimers();
    });
    expect(view.getByLabelText('messageMenu.cancel')).toBeTruthy();

    act(() => {
      ref.current?.close();
    });
    act(() => {
      jest.runAllTimers();
    });

    expect(focusSpy).not.toHaveBeenCalled();

    focusSpy.mockRestore();
    jest.useRealTimers();
  });

  it('uses the LATEST triggerNodeHandle when open() is called twice in sequence', () => {
    jest.useFakeTimers();
    const focusSpy = jest
      .spyOn(AccessibilityInfo, 'setAccessibilityFocus')
      .mockImplementation(() => undefined);

    const ref = React.createRef<RouterHandle>();
    render(<RouterTestHost ref={ref} />);

    act(() => {
      ref.current?.open('context-menu', { message: { id: 'a' } }, { triggerNodeHandle: 100 });
    });
    act(() => {
      jest.runAllTimers();
    });

    act(() => {
      ref.current?.open('context-menu', { message: { id: 'b' } }, { triggerNodeHandle: 200 });
    });
    act(() => {
      jest.runAllTimers();
    });
    act(() => {
      jest.runAllTimers();
    });

    act(() => {
      ref.current?.close();
    });
    act(() => {
      jest.runAllTimers();
    });

    expect(focusSpy).toHaveBeenCalledWith(200);

    focusSpy.mockRestore();
    jest.useRealTimers();
  });
});
