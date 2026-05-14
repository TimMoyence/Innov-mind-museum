/**
 * Tests for swipe-down dismiss (spec R8 / R13).
 *
 * `<BottomSheetContainer>` attaches a `PanResponder` when:
 *   - `presentation === 'sheet'`, AND
 *   - the route is NOT blocking.
 *
 * Past 50% of the measured sheet height the responder calls
 * `onBackdropPress` (which the router gates on non-blocking already). Under
 * Reduce Motion the spring-back is replaced by a synchronous `setValue` snap.
 *
 * The tests drive the responder by capturing the `PanResponder.create` config
 * via a `jest.spyOn` and invoking the `onPanResponderRelease(evt, gestureState)`
 * callback DIRECTLY. We avoid going through the View's `panHandlers` spread
 * because the React responder system reconstructs gestureState internally
 * from raw touch events — we can't fabricate a `dy=250` without simulating
 * the full touch lifecycle, which is brittle. The captured config is the
 * same closure the production code uses, so we still cover the real release
 * logic.
 */

import React from 'react';
import { Animated, PanResponder, type PanResponderInstance } from 'react-native';
import { act, render } from '@testing-library/react-native';

import '../../../helpers/test-utils';

const mockReduceMotion = jest.fn(() => false);
jest.mock('@/shared/ui/hooks/useReducedMotion', () => ({
  useReducedMotion: () => mockReduceMotion(),
}));

import { installMockRoutes, RouterTestHost, type RouterHandle } from './test-harness';

interface GestureState {
  dx: number;
  dy: number;
  vx: number;
  vy: number;
  x0: number;
  y0: number;
  moveX: number;
  moveY: number;
  stateID: number;
  numberActiveTouches: number;
}

function makeGestureState(dy: number): GestureState {
  return {
    dx: 0,
    dy,
    vx: 0,
    vy: 0,
    x0: 0,
    y0: 0,
    moveX: 0,
    moveY: dy,
    stateID: 1,
    numberActiveTouches: 1,
  };
}

/**
 * Captured PanResponder config typed for the handlers we exercise. The full
 * `PanResponderConfig` shape is broader; we only care about `onPanResponder*`
 * handlers + the `onMoveShouldSetPanResponder` predicate.
 */
interface CapturedConfig {
  onMoveShouldSetPanResponder?: (e: unknown, g: GestureState) => boolean;
  onPanResponderMove?: (e: unknown, g: GestureState) => void;
  onPanResponderRelease?: (e: unknown, g: GestureState) => void;
  onPanResponderTerminate?: (e: unknown, g: GestureState) => void;
}

/**
 * Walk the rendered tree to find the Animated.View carrying `onLayout` (the
 * sheet wrapper). We invoke `onLayout` to publish the measured height to the
 * container's ref.
 */
function findSheetLayout(
  start: unknown,
): ((event: { nativeEvent: { layout: { height: number } } }) => void) | null {
  let node: unknown = start;
  while (node && typeof node === 'object' && 'parent' in node) {
    const candidate = node as {
      parent: unknown;
      props?: {
        onLayout?: (event: { nativeEvent: { layout: { height: number } } }) => void;
        onResponderRelease?: unknown;
      };
    };
    // The sheet wrapper carries both `onLayout` and the responder handler.
    if (candidate.props?.onLayout && candidate.props?.onResponderRelease) {
      return candidate.props.onLayout;
    }
    node = candidate.parent;
  }
  return null;
}

describe('BottomSheetContainer — swipe-down dismiss (R8 / R13)', () => {
  let capturedConfig: CapturedConfig | null = null;
  let panResponderSpy: jest.SpyInstance | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReduceMotion.mockReturnValue(false);
    installMockRoutes();
    capturedConfig = null;
    // Spy on PanResponder.create so we capture the config closure used by the
    // production code. The real RN factory is still invoked for runtime parity.
    panResponderSpy = jest
      .spyOn(PanResponder, 'create')
      .mockImplementation((config: unknown): PanResponderInstance => {
        capturedConfig = config as CapturedConfig;
        // Return a minimal PanResponderInstance shape — the container only
        // reads `.panHandlers`, and during tests we never invoke the real
        // touch path on those handlers (we drive the captured config above).
        return {
          panHandlers: {
            // Cast to record because the RN PanResponder.panHandlers shape
            // is broader (~7 internal callbacks); we only need a non-null
            // object for the JSX spread.
            onResponderRelease: () => undefined,
            onResponderMove: () => undefined,
            onStartShouldSetResponder: () => false,
            onMoveShouldSetResponder: () => false,
            onResponderGrant: () => undefined,
            onResponderTerminate: () => undefined,
            onResponderTerminationRequest: () => true,
          },
          // `getInteractionHandle` exists on the real type — return a dummy.
          getInteractionHandle: () => 0,
        } as unknown as PanResponderInstance;
      });
  });

  afterEach(() => {
    panResponderSpy?.mockRestore();
  });

  it('non-blocking sheet route: drag past 50% of measured height closes the sheet', () => {
    jest.useFakeTimers();
    const ref = React.createRef<RouterHandle>();
    const view = render(<RouterTestHost ref={ref} />);

    act(() => {
      ref.current?.open('context-menu', { message: { id: 'msg-1' } });
    });
    act(() => {
      jest.runAllTimers();
    });

    const anchor = view.getByLabelText('messageMenu.cancel');
    const onLayout = findSheetLayout(anchor);
    expect(onLayout).not.toBeNull();
    expect(capturedConfig).not.toBeNull();

    // Publish the measured height — threshold becomes 200px.
    act(() => {
      onLayout?.({ nativeEvent: { layout: { height: 400 } } });
    });

    // Past threshold (250 > 200) → onBackdropPress fires → close.
    act(() => {
      capturedConfig?.onPanResponderRelease?.({}, makeGestureState(250));
    });
    // Drain the exit anim → container dispatches CLOSE_DONE.
    act(() => {
      jest.runAllTimers();
    });

    expect(view.queryByLabelText('messageMenu.cancel')).toBeNull();
    jest.useRealTimers();
  });

  it('blocking route: PanResponder.create is NOT invoked (swipe-down disabled)', () => {
    jest.useFakeTimers();
    const ref = React.createRef<RouterHandle>();
    const view = render(<RouterTestHost ref={ref} />);

    act(() => {
      ref.current?.open('consent', {});
    });
    act(() => {
      jest.runAllTimers();
    });

    // Spec R11: blocking routes must NOT respond to swipe-down. The container
    // skips the PanResponder entirely so the gesture surface is inert.
    expect(panResponderSpy).not.toHaveBeenCalled();
    expect(capturedConfig).toBeNull();
    expect(view.getByLabelText('consent.accept')).toBeTruthy();

    jest.useRealTimers();
  });

  it('non-blocking sheet route: drag at 30% springs back without closing', () => {
    jest.useFakeTimers();
    const springSpy = jest.spyOn(Animated, 'spring').mockImplementation(
      () =>
        // Minimal CompositeAnimation shape — only `.start()` is invoked.
        ({
          start: jest.fn(),
          stop: jest.fn(),
          reset: jest.fn(),
        }) as unknown as ReturnType<typeof Animated.spring>,
    );
    const ref = React.createRef<RouterHandle>();
    const view = render(<RouterTestHost ref={ref} />);

    act(() => {
      ref.current?.open('context-menu', { message: { id: 'msg-1' } });
    });
    act(() => {
      jest.runAllTimers();
    });

    const anchor = view.getByLabelText('messageMenu.cancel');
    const onLayout = findSheetLayout(anchor);
    expect(capturedConfig).not.toBeNull();

    act(() => {
      onLayout?.({ nativeEvent: { layout: { height: 400 } } });
    });

    // Drag below threshold (120 < 200) → spring-back, no close.
    act(() => {
      capturedConfig?.onPanResponderRelease?.({}, makeGestureState(120));
    });

    // Sheet still mounted, spring fired.
    expect(view.getByLabelText('messageMenu.cancel')).toBeTruthy();
    expect(springSpy).toHaveBeenCalled();

    springSpy.mockRestore();
    jest.useRealTimers();
  });

  it('reduce-motion mocked true: spring-back snaps without Animated.spring (R13)', () => {
    jest.useFakeTimers();
    mockReduceMotion.mockReturnValue(true);
    const springSpy = jest.spyOn(Animated, 'spring');

    const ref = React.createRef<RouterHandle>();
    const view = render(<RouterTestHost ref={ref} />);

    act(() => {
      ref.current?.open('context-menu', { message: { id: 'msg-1' } });
    });
    act(() => {
      jest.runAllTimers();
    });

    const anchor = view.getByLabelText('messageMenu.cancel');
    const onLayout = findSheetLayout(anchor);
    expect(capturedConfig).not.toBeNull();

    act(() => {
      onLayout?.({ nativeEvent: { layout: { height: 400 } } });
    });
    // Drag at 30% → spring-back path. Under reduce motion: snap, no spring.
    act(() => {
      capturedConfig?.onPanResponderRelease?.({}, makeGestureState(120));
    });

    expect(view.getByLabelText('messageMenu.cancel')).toBeTruthy();
    expect(springSpy).not.toHaveBeenCalled();

    springSpy.mockRestore();
    jest.useRealTimers();
  });
});
