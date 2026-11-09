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

interface UseCompareImageInput {
  image: { uri: string; name: string; type: string };
  sessionId: string;
  topK?: number;
  locale?: 'fr' | 'en';
}

interface UseCompareImageMutation {
  mutate: (input: UseCompareImageInput) => void;
  mutateAsync: (input: UseCompareImageInput) => Promise<unknown>;
  reset: () => void;
  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
  data: unknown;
  error: Error | null;
}

type UseCompareImageHook = () => UseCompareImageMutation;

const loadHook = (): UseCompareImageHook => {
  const mod = require('@/features/chat/application/useCompareImage') as {
    useCompareImage: UseCompareImageHook;
  };
  return mod.useCompareImage;
};

const sampleInput: UseCompareImageInput = {
  image: { uri: 'file:///tmp/photo.jpg', name: 'photo.jpg', type: 'image/jpeg' },
  sessionId: '11111111-1111-1111-1111-111111111111',
  topK: 5,
  locale: 'fr',
};

describe('useCompareImage (T8.1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts in idle state (isPending=false, data=undefined, error=null)', () => {
    const useCompareImage = loadHook();
    const { result } = renderHookWithQueryClient(() => useCompareImage());

    expect(result.current.isPending).toBe(false);
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBeNull();
  });

  it('returns the backend CompareResult on a successful POST /chat/compare', async () => {
    const compareResult = makeCompareResult();
    mockCompare.mockResolvedValue(compareResult);

    const useCompareImage = loadHook();
    const { result } = renderHookWithQueryClient(() => useCompareImage());

    await act(async () => {
      await result.current.mutateAsync(sampleInput);
    });

    expect(mockCompare).toHaveBeenCalledTimes(1);
    const [calledInput] = mockCompare.mock.calls[0] as [unknown];
    expect(calledInput).toEqual(sampleInput);
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data).toEqual(compareResult);
    expect(result.current.error).toBeNull();
  });

  it('exposes an error and leaves data undefined when the request fails (network)', async () => {
    mockCompare.mockRejectedValue(new Error('Network Error'));

    const useCompareImage = loadHook();
    const { result } = renderHookWithQueryClient(() => useCompareImage());

    await act(async () => {
      await result.current.mutateAsync(sampleInput).catch(() => undefined);
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(result.current.error).not.toBeNull();
    expect(result.current.data).toBeUndefined();
  });

  it('maps a 503 COMPARE_ENCODER_UNAVAILABLE response to a user-friendly error message', async () => {
    const err = Object.assign(new Error('encoder down'), {
      response: {
        status: 503,
        data: { error: { code: 'COMPARE_ENCODER_UNAVAILABLE', message: 'Encoder offline' } },
      },
    });
    mockCompare.mockRejectedValue(err);

    const useCompareImage = loadHook();
    const { result } = renderHookWithQueryClient(() => useCompareImage());

    await act(async () => {
      await result.current.mutateAsync(sampleInput).catch(() => undefined);
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    const message = result.current.error?.message ?? '';
    expect(message.length).toBeGreaterThan(0);
    expect(message).not.toMatch(/Network Error/i);
    expect(message).not.toBe('encoder down');
  });

  it('does NOT retry on a 4xx (client error) — single attempt only', async () => {
    const err = Object.assign(new Error('bad request'), {
      response: {
        status: 400,
        data: { error: { code: 'COMPARE_INVALID_IMAGE', message: 'Unsupported MIME type' } },
      },
    });
    mockCompare.mockRejectedValue(err);

    const useCompareImage = loadHook();
    const { result } = renderHookWithQueryClient(() => useCompareImage());

    await act(async () => {
      await result.current.mutateAsync(sampleInput).catch(() => undefined);
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(mockCompare).toHaveBeenCalledTimes(1);
  });
});
