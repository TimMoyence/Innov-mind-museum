import '../../../helpers/test-utils';
import { act, waitFor } from '@testing-library/react-native';

import { renderHookWithQueryClient } from '../../../helpers/data/renderWithQueryClient';
import { makeCompareResult } from '../../../helpers/factories';

const mockCompare = jest.fn();
jest.mock('@/features/chat/infrastructure/imageComparisonApi', () => ({
  imageComparisonApi: {
    compare: (...args: unknown[]) => mockCompare(...args),
  },
}));

interface RnImage {
  uri: string;
  name: string;
  type: string;
}

interface UseCompareTriggerParams {
  sessionId: string;
  locale?: 'fr' | 'en';
  reload: () => Promise<void> | void;
}

interface UseCompareTriggerResult {
  trigger: (image: RnImage) => void;
  isPending: boolean;
  error: string | null;
}

type UseCompareTriggerHook = (params: UseCompareTriggerParams) => UseCompareTriggerResult;

const loadHook = (): UseCompareTriggerHook => {
  const mod = require('@/features/chat/application/useCompareTrigger') as {
    useCompareTrigger: UseCompareTriggerHook;
  };
  return mod.useCompareTrigger;
};

const SESSION_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SESSION_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const sampleImage: RnImage = {
  uri: 'file:///tmp/photo.jpg',
  name: 'photo.jpg',
  type: 'image/jpeg',
};

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('useCompareTrigger — D-01 / D-02 / D-08 (Option C)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls imageComparisonApi.compare with the picked image + session context (D-01 wiring)', async () => {
    mockCompare.mockResolvedValue(makeCompareResult());
    const reload = jest.fn().mockResolvedValue(undefined);

    const useCompareTrigger = loadHook();
    const { result } = renderHookWithQueryClient(() =>
      useCompareTrigger({ sessionId: SESSION_A, locale: 'fr', reload }),
    );

    await act(async () => {
      result.current.trigger(sampleImage);
    });

    await waitFor(() => {
      expect(mockCompare).toHaveBeenCalledTimes(1);
    });
    const [calledInput] = mockCompare.mock.calls[0] as [
      { image: RnImage; sessionId: string; locale?: string },
    ];
    expect(calledInput.image).toEqual(sampleImage);
    expect(calledInput.sessionId).toBe(SESSION_A);
    expect(calledInput.locale).toBe('fr');
  });

  it('invokes reload() exactly once after a successful compare (D-02 surfaçage)', async () => {
    mockCompare.mockResolvedValue(makeCompareResult());
    const reload = jest.fn().mockResolvedValue(undefined);

    const useCompareTrigger = loadHook();
    const { result } = renderHookWithQueryClient(() =>
      useCompareTrigger({ sessionId: SESSION_A, locale: 'en', reload }),
    );

    await act(async () => {
      result.current.trigger(sampleImage);
    });

    await waitFor(() => {
      expect(reload).toHaveBeenCalledTimes(1);
    });
  });

  it('does NOT reload when the compare call fails (D-02 — no phantom surface)', async () => {
    mockCompare.mockRejectedValue(new Error('Network Error'));
    const reload = jest.fn().mockResolvedValue(undefined);

    const useCompareTrigger = loadHook();
    const { result } = renderHookWithQueryClient(() =>
      useCompareTrigger({ sessionId: SESSION_A, reload }),
    );

    await act(async () => {
      result.current.trigger(sampleImage);
    });

    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });
    expect(reload).not.toHaveBeenCalled();
  });

  it('exposes isPending while the compare is in-flight and clears it on success (D-08.1 / D-08.4)', async () => {
    const gate = deferred<ReturnType<typeof makeCompareResult>>();
    mockCompare.mockReturnValue(gate.promise);
    const reload = jest.fn().mockResolvedValue(undefined);

    const useCompareTrigger = loadHook();
    const { result } = renderHookWithQueryClient(() =>
      useCompareTrigger({ sessionId: SESSION_A, reload }),
    );

    expect(result.current.isPending).toBe(false);

    await act(async () => {
      result.current.trigger(sampleImage);
    });
    await waitFor(() => {
      expect(result.current.isPending).toBe(true);
    });

    await act(async () => {
      gate.resolve(makeCompareResult());
      await gate.promise;
    });
    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });
  });

  it('surfaces a user-friendly i18n error on 503 COMPARE_ENCODER_UNAVAILABLE, never the raw axios detail (D-08.2)', async () => {
    const err = Object.assign(new Error('encoder down'), {
      response: {
        status: 503,
        data: { error: { code: 'COMPARE_ENCODER_UNAVAILABLE', message: 'Encoder offline' } },
      },
    });
    mockCompare.mockRejectedValue(err);
    const reload = jest.fn().mockResolvedValue(undefined);

    const useCompareTrigger = loadHook();
    const { result } = renderHookWithQueryClient(() =>
      useCompareTrigger({ sessionId: SESSION_A, reload }),
    );

    await act(async () => {
      result.current.trigger(sampleImage);
    });

    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });
    const message = result.current.error ?? '';
    expect(message).toBe('chat.compare.error.unavailable');
    expect(message).not.toBe('encoder down');
  });

  it('does not reload session B with a stale success that resolved after the session changed (D-08.3 anti-stale)', async () => {
    const gate = deferred<ReturnType<typeof makeCompareResult>>();
    mockCompare.mockReturnValueOnce(gate.promise);
    const reloadA = jest.fn().mockResolvedValue(undefined);
    const reloadB = jest.fn().mockResolvedValue(undefined);

    const useCompareTrigger = loadHook();
    const { result, rerender } = renderHookWithQueryClient(
      (params: UseCompareTriggerParams) => useCompareTrigger(params),
      { initialProps: { sessionId: SESSION_A, reload: reloadA } },
    );

    await act(async () => {
      result.current.trigger(sampleImage);
    });
    await waitFor(() => {
      expect(result.current.isPending).toBe(true);
    });

    rerender({ sessionId: SESSION_B, reload: reloadB });

    await act(async () => {
      gate.resolve(makeCompareResult());
      await gate.promise;
    });

    await waitFor(() => {
      expect(reloadB).not.toHaveBeenCalled();
    });
    expect(reloadA).not.toHaveBeenCalled();
  });
});
