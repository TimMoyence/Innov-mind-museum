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

interface CapturedConfig {
  onMoveShouldSetPanResponder?: (e: unknown, g: GestureState) => boolean;
  onPanResponderMove?: (e: unknown, g: GestureState) => void;
  onPanResponderRelease?: (e: unknown, g: GestureState) => void;
  onPanResponderTerminate?: (e: unknown, g: GestureState) => void;
}

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
    panResponderSpy = jest
      .spyOn(PanResponder, 'create')
      .mockImplementation((config: unknown): PanResponderInstance => {
        capturedConfig = config as CapturedConfig;
        return {
          panHandlers: {
            onResponderRelease: () => undefined,
            onResponderMove: () => undefined,
            onStartShouldSetResponder: () => false,
            onMoveShouldSetResponder: () => false,
            onResponderGrant: () => undefined,
            onResponderTerminate: () => undefined,
            onResponderTerminationRequest: () => true,
          },
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

    act(() => {
      onLayout?.({ nativeEvent: { layout: { height: 400 } } });
    });

    act(() => {
      capturedConfig?.onPanResponderRelease?.({}, makeGestureState(250));
    });
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

    expect(panResponderSpy).not.toHaveBeenCalled();
    expect(capturedConfig).toBeNull();
    expect(view.getByLabelText('consent.accept')).toBeTruthy();

    jest.useRealTimers();
  });

  it('non-blocking sheet route: drag at 30% springs back without closing', () => {
    jest.useFakeTimers();
    const springSpy = jest.spyOn(Animated, 'spring').mockImplementation(
      () =>
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

    act(() => {
      capturedConfig?.onPanResponderRelease?.({}, makeGestureState(120));
    });

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
    act(() => {
      capturedConfig?.onPanResponderRelease?.({}, makeGestureState(120));
    });

    expect(view.getByLabelText('messageMenu.cancel')).toBeTruthy();
    expect(springSpy).not.toHaveBeenCalled();

    springSpy.mockRestore();
    jest.useRealTimers();
  });
});
