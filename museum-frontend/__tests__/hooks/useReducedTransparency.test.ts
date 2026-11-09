import '@/__tests__/helpers/test-utils';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { useReducedTransparency } from '@/shared/ui/hooks/useReducedTransparency';

type ReduceTransparencyListener = (value: boolean) => void;

const subscriptionRemove = jest.fn();
let capturedListener: ReduceTransparencyListener | null = null;

const isReduceTransparencyEnabledMock = jest.spyOn(
  AccessibilityInfo as unknown as { isReduceTransparencyEnabled: () => Promise<boolean> },
  'isReduceTransparencyEnabled',
);

const addEventListenerMock = jest.spyOn(
  AccessibilityInfo,
  'addEventListener',
) as unknown as jest.Mock;

beforeEach(() => {
  subscriptionRemove.mockClear();
  capturedListener = null;
  isReduceTransparencyEnabledMock.mockReset();
  addEventListenerMock.mockReset();
  addEventListenerMock.mockImplementation(
    (event: string, handler: (...args: unknown[]) => void) => {
      if (event === 'reduceTransparencyChanged') {
        capturedListener = handler as ReduceTransparencyListener;
      }
      return { remove: subscriptionRemove };
    },
  );
});

afterAll(() => {
  isReduceTransparencyEnabledMock.mockRestore();
  addEventListenerMock.mockRestore();
});

describe('useReducedTransparency', () => {
  it('returns false until the platform resolves (R1)', async () => {
    let resolveEnabled: (value: boolean) => void = () => undefined;
    isReduceTransparencyEnabledMock.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveEnabled = resolve;
      }),
    );

    const { result } = renderHook(() => useReducedTransparency());
    expect(result.current).toBe(false);

    act(() => {
      resolveEnabled(false);
    });

    await Promise.resolve();
    expect(result.current).toBe(false);
  });

  it('reflects the initial platform value when reduce transparency is enabled (R1)', async () => {
    isReduceTransparencyEnabledMock.mockResolvedValue(true);

    const { result } = renderHook(() => useReducedTransparency());

    await waitFor(() => {
      expect(result.current).toBe(true);
    });
  });

  it('updates when the reduceTransparencyChanged event fires (R2)', async () => {
    isReduceTransparencyEnabledMock.mockResolvedValue(false);

    const { result } = renderHook(() => useReducedTransparency());

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

  it('removes the listener on unmount (R4)', async () => {
    isReduceTransparencyEnabledMock.mockResolvedValue(false);

    const { unmount } = renderHook(() => useReducedTransparency());
    await waitFor(() => {
      expect(addEventListenerMock).toHaveBeenCalledWith(
        'reduceTransparencyChanged',
        expect.any(Function),
      );
    });

    unmount();
    expect(subscriptionRemove).toHaveBeenCalledTimes(1);
  });

  it('survives isReduceTransparencyEnabled rejection — defaults to false (R3)', async () => {
    isReduceTransparencyEnabledMock.mockRejectedValue(new Error('not supported'));

    const { result } = renderHook(() => useReducedTransparency());

    await waitFor(() => {
      expect(addEventListenerMock).toHaveBeenCalled();
    });

    expect(result.current).toBe(false);
  });
});
