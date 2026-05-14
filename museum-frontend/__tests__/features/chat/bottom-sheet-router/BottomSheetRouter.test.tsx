/**
 * Red component tests for `<BottomSheetRouter />` (C4 / AC4, AC5, AC6, AC7).
 *
 * These tests target router orchestration only — the real `*SheetContent`
 * components live behind the route registry. Tests inject mock content
 * components via `test-harness.tsx::installMockRoutes()` and drive the
 * router imperatively via `RouterTestHost` + ref.
 */

import React from 'react';
import { AccessibilityInfo, Animated, BackHandler } from 'react-native';
import { act, render } from '@testing-library/react-native';

import '../../../helpers/test-utils';

const mockReduceMotion = jest.fn(() => false);
jest.mock('@/shared/ui/hooks/useReducedMotion', () => ({
  useReducedMotion: () => mockReduceMotion(),
}));

import { installMockRoutes, RouterTestHost, type RouterHandle } from './test-harness';

type BackHandlerCallback = () => boolean | null | undefined;

function captureBackHandler(): { invoke: () => boolean | null | undefined } {
  let captured: BackHandlerCallback | null = null;
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((event, cb) => {
    if (event === 'hardwareBackPress') captured = cb as BackHandlerCallback;
    return { remove: jest.fn() };
  });
  return {
    invoke: () => {
      if (!captured) throw new Error('hardwareBackPress callback not registered');
      return captured();
    },
  };
}

describe('<BottomSheetRouter /> — orchestration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReduceMotion.mockReturnValue(false);
    installMockRoutes();
  });

  // ── AC4 ────────────────────────────────────────────────────────────────────
  describe('AC4 — open / close lifecycle', () => {
    it('renders the route Content when open() is called', () => {
      const ref = React.createRef<RouterHandle>();
      const view = render(<RouterTestHost ref={ref} />);
      expect(view.queryByLabelText('consent.accept')).toBeNull();

      act(() => {
        ref.current?.open('consent', {});
      });

      expect(view.getByLabelText('consent.accept')).toBeTruthy();
    });

    it('unmounts the route Content when close() is called', () => {
      jest.useFakeTimers();
      const ref = React.createRef<RouterHandle>();
      const view = render(<RouterTestHost ref={ref} />);

      act(() => {
        ref.current?.open('context-menu', { message: { id: 'msg-1' } });
      });
      // Drain the entrance `Animated.timing` so the reducer settles `open`.
      act(() => {
        jest.runAllTimers();
      });
      expect(view.getByLabelText('messageMenu.cancel')).toBeTruthy();

      act(() => {
        ref.current?.close();
      });
      // Drain the exit `Animated.timing` so the container dispatches CLOSE_DONE
      // and the reducer settles back to `idle` (spec R12 sequencing).
      act(() => {
        jest.runAllTimers();
      });

      expect(view.queryByLabelText('messageMenu.cancel')).toBeNull();
      jest.useRealTimers();
    });
  });

  // ── AC5 ────────────────────────────────────────────────────────────────────
  describe('AC5 — accessibility invariants on mount', () => {
    it('sets accessibilityViewIsModal=true on the sheet container', () => {
      const ref = React.createRef<RouterHandle>();
      const view = render(<RouterTestHost ref={ref} />);
      act(() => {
        ref.current?.open('consent', {});
      });

      // The sheet container must wrap the content with accessibilityViewIsModal.
      const accept = view.getByLabelText('consent.accept');
      // Walk up the rendered tree (TestInstance) to find the dialog container.
      let node: unknown = accept;
      let modal: { props: { accessibilityViewIsModal?: boolean } } | null = null;
      while (node && typeof node === 'object' && 'parent' in node) {
        const candidate = node as {
          parent: unknown;
          props?: { accessibilityViewIsModal?: boolean };
        };
        if (candidate.props?.accessibilityViewIsModal === true) {
          modal = candidate as { props: { accessibilityViewIsModal?: boolean } };
          break;
        }
        node = candidate.parent;
      }
      expect(modal).not.toBeNull();
    });

    it('sets accessibilityRole="dialog" on the sheet container', () => {
      const ref = React.createRef<RouterHandle>();
      const view = render(<RouterTestHost ref={ref} />);
      act(() => {
        ref.current?.open('consent', {});
      });

      const accept = view.getByLabelText('consent.accept');
      let node: unknown = accept;
      let found = false;
      while (node && typeof node === 'object' && 'parent' in node) {
        const candidate = node as {
          parent: unknown;
          props?: { accessibilityRole?: string };
        };
        if (candidate.props?.accessibilityRole === 'dialog') {
          found = true;
          break;
        }
        node = candidate.parent;
      }
      expect(found).toBe(true);
    });

    it('calls AccessibilityInfo.announceForAccessibility once with a non-empty string on mount', () => {
      const announceSpy = jest
        .spyOn(AccessibilityInfo, 'announceForAccessibility')
        .mockImplementation(() => undefined);
      const ref = React.createRef<RouterHandle>();
      render(<RouterTestHost ref={ref} />);

      act(() => {
        ref.current?.open('consent', {});
      });

      expect(announceSpy).toHaveBeenCalledTimes(1);
      const arg = announceSpy.mock.calls[0]?.[0];
      expect(typeof arg).toBe('string');
      expect((arg ?? '').length).toBeGreaterThan(0);
      announceSpy.mockRestore();
    });
  });

  // ── AC6 ────────────────────────────────────────────────────────────────────
  describe('AC6 — reduced motion skips animations', () => {
    it('does NOT call Animated.timing with duration>0 when useReducedMotion()=true', () => {
      mockReduceMotion.mockReturnValue(true);
      const timingSpy = jest.spyOn(Animated, 'timing');

      const ref = React.createRef<RouterHandle>();
      render(<RouterTestHost ref={ref} />);

      act(() => {
        ref.current?.open('consent', {});
      });

      for (const call of timingSpy.mock.calls) {
        const config = call[1];
        // Either timing is not used at all, or duration is 0 (snap).
        expect(config?.duration ?? 0).toBe(0);
      }

      timingSpy.mockRestore();
    });
  });

  // ── AC7 ────────────────────────────────────────────────────────────────────
  describe('AC7 — Android hardware back button', () => {
    it('non-blocking route: back press closes the sheet and consumes the event', () => {
      jest.useFakeTimers();
      const back = captureBackHandler();
      const ref = React.createRef<RouterHandle>();
      const view = render(<RouterTestHost ref={ref} />);

      act(() => {
        ref.current?.open('context-menu', { message: { id: 'msg-1' } });
      });
      act(() => {
        jest.runAllTimers();
      });
      expect(view.getByLabelText('messageMenu.cancel')).toBeTruthy();

      let consumed: boolean | null | undefined = false;
      act(() => {
        consumed = back.invoke();
      });
      // Drain the exit `Animated.timing` so CLOSE_DONE fires (spec R12).
      act(() => {
        jest.runAllTimers();
      });

      expect(consumed).toBe(true);
      expect(view.queryByLabelText('messageMenu.cancel')).toBeNull();
      jest.useRealTimers();
    });

    it('blocking route: back press consumes the event but does NOT close the sheet', () => {
      const back = captureBackHandler();
      const ref = React.createRef<RouterHandle>();
      const view = render(<RouterTestHost ref={ref} />);

      act(() => {
        ref.current?.open('consent', {});
      });
      expect(view.getByLabelText('consent.accept')).toBeTruthy();

      let consumed: boolean | null | undefined = false;
      act(() => {
        consumed = back.invoke();
      });

      expect(consumed).toBe(true);
      expect(view.getByLabelText('consent.accept')).toBeTruthy();
    });
  });
});
