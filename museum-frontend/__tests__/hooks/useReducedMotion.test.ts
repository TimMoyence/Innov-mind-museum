import '@/__tests__/helpers/test-utils';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { useReducedMotion } from '@/shared/ui/hooks/useReducedMotion';

// ── Mocks ────────────────────────────────────────────────────────────────────

type ReduceMotionListener = (value: boolean) => void;

const subscriptionRemove = jest.fn();
let capturedListener: ReduceMotionListener | null = null;
const isReduceMotionEnabledMock = jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled');

const addEventListenerMock = jest.spyOn(AccessibilityInfo, 'addEventListener') as any;

beforeEach(() => {
  subscriptionRemove.mockClear();
  capturedListener = null;
  isReduceMotionEnabledMock.mockReset();
  addEventListenerMock.mockReset();
  addEventListenerMock.mockImplementation(
    (event: string, handler: (...args: unknown[]) => void) => {
      if (event === 'reduceMotionChanged') {
        capturedListener = handler as ReduceMotionListener;
      }
      return { remove: subscriptionRemove };
    },
  );
});

afterAll(() => {
  isReduceMotionEnabledMock.mockRestore();
  addEventListenerMock.mockRestore();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useReducedMotion', () => {
  it('returns false until the platform resolves', async () => {
    let resolveEnabled: (value: boolean) => void = () => undefined;
    isReduceMotionEnabledMock.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveEnabled = resolve;
      }),
    );

    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);

    act(() => {
      resolveEnabled(false);
    });

    expect(result.current).toBe(false);
  });

  it('reflects the initial platform value when reduce motion is enabled', async () => {
    isReduceMotionEnabledMock.mockResolvedValue(true);

    const { result } = renderHook(() => useReducedMotion());

    await waitFor(() => {
      expect(result.current).toBe(true);
    });
  });

  it('updates when the reduceMotionChanged event fires', async () => {
    isReduceMotionEnabledMock.mockResolvedValue(false);

    const { result } = renderHook(() => useReducedMotion());

    await waitFor(() => {
      expect(result.current).toBe(false);
    });

    expect(capturedListener).not.toBeNull();

    act(() => {
      capturedListener?.(true);
    });
    expect(result.current).toBe(true);

    act(() => {
      capturedListener?.(false);
    });
    expect(result.current).toBe(false);
  });

  it('removes the listener on unmount', async () => {
    isReduceMotionEnabledMock.mockResolvedValue(false);

    const { unmount } = renderHook(() => useReducedMotion());
    await waitFor(() => {
      expect(addEventListenerMock).toHaveBeenCalledWith(
        'reduceMotionChanged',
        expect.any(Function),
      );
    });

    unmount();
    expect(subscriptionRemove).toHaveBeenCalledTimes(1);
  });

  it('survives isReduceMotionEnabled rejection (defaults to false)', async () => {
    isReduceMotionEnabledMock.mockRejectedValue(new Error('not supported'));

    const { result } = renderHook(() => useReducedMotion());

    await waitFor(() => {
      expect(addEventListenerMock).toHaveBeenCalled();
    });

    expect(result.current).toBe(false);
  });
});
