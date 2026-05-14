/**
 * Tests for screen-reader focus capture & restore (spec R15 / R16, WCAG 2.2 AA).
 *
 * The router is a best-effort focus-restore implementation: RN 0.83 has no
 * public API to capture the currently-focused accessibility element for
 * arbitrary views (`AccessibilityInfo.getCurrentlyFocusedField` covers
 * TextInput only). The call-site opts in by passing a `triggerNodeHandle`
 * obtained from `findNodeHandle(ref.current)`; the router stores it and
 * replays `AccessibilityInfo.setAccessibilityFocus(handle)` once the close
 * animation settles.
 *
 * These tests assert the router round-trips a provided handle through
 * `setAccessibilityFocus`, and that omitting the handle is a no-op rather
 * than a faked / random call.
 */

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

    // Open the sheet with a trigger handle representing the invoking element.
    act(() => {
      ref.current?.open('context-menu', { message: { id: 'msg-1' } }, { triggerNodeHandle: 4242 });
    });
    act(() => {
      jest.runAllTimers();
    });
    expect(view.getByLabelText('messageMenu.cancel')).toBeTruthy();
    // No focus restore yet — only on close.
    expect(focusSpy).not.toHaveBeenCalled();

    act(() => {
      ref.current?.close();
    });
    act(() => {
      jest.runAllTimers();
    });

    // The captured handle is replayed exactly once on close.
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

    // Open without trigger handle — best-effort behaviour is "do nothing".
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

    // Second open replaces — last-write-wins (spec R2) — and overwrites the
    // captured handle.
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

    // The last opener's handle (200) is what we restore on close — the first
    // opener's handle (100) was overwritten by the second open() call.
    expect(focusSpy).toHaveBeenCalledWith(200);

    focusSpy.mockRestore();
    jest.useRealTimers();
  });
});
