/**
 * RED tests for `useCompareImage` (T8.1, Phase 8 — C3 Image Comparative).
 *
 * SUT: `museum-frontend/features/chat/application/useCompareImage.ts` —
 * a React Query mutation hook that POSTs a multipart `image + sessionId`
 * payload to `/api/chat/compare` and returns a `CompareResult`.
 *
 * Contract under test:
 *  - Idle initial state (`isPending=false`, no data, no error).
 *  - Success path: mutateAsync resolves with the backend `CompareResult`.
 *  - Network error → exposes `error`, no `data`.
 *  - 503 (`COMPARE_ENCODER_UNAVAILABLE`) → mapped to a user-friendly message.
 *  - Retry policy: only retries on 5xx, never on 4xx.
 *
 * The SUT does NOT exist yet — these tests must FAIL on import.
 */
import '../../../helpers/test-utils';
import { act, waitFor } from '@testing-library/react-native';

import { renderHookWithQueryClient } from '../../../helpers/data/renderWithQueryClient';
import { makeCompareResult } from '../../../helpers/factories';

// ── Mock the infra service used by the hook (C1 hexagonal 2026-05-23) ────
// Previously mocked `httpClient.post` directly ; now mocks
// `imageComparisonApi.compare`. The service unwraps `response.data` for the
// hook, so mock resolutions are raw `CompareResult` payloads (no `.data` wrap).
const mockCompare = jest.fn();

jest.mock('@/features/chat/infrastructure/imageComparisonApi', () => ({
  imageComparisonApi: {
    compare: (...args: unknown[]) => mockCompare(...args),
  },
}));

// SUT import must come AFTER jest.mock() so the mock is hoisted in time.
// We import lazily inside each test via require() so a missing module fails
// the test (RED-confirmed) instead of the whole file failing to load.
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
  // Lazy require so the missing-SUT failure mode is a clean test-level
  // "Cannot find module" rather than a file-load crash that hides which test
  // triggered it. Standard RED-test pattern across this PR.
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
    // Service unwraps response.data for the hook — mock returns the payload.
    mockCompare.mockResolvedValue(compareResult);

    const useCompareImage = loadHook();
    const { result } = renderHookWithQueryClient(() => useCompareImage());

    await act(async () => {
      await result.current.mutateAsync(sampleInput);
    });

    expect(mockCompare).toHaveBeenCalledTimes(1);
    const [calledInput] = mockCompare.mock.calls[0] as [unknown];
    // Hook now passes the input shape directly to the service.
    expect(calledInput).toEqual(sampleInput);
    // React Query's notifyManager flushes state via setTimeout(0); without a
    // waitFor the assertion would race the post-mutationFn setState even though
    // mutateAsync's promise has already resolved.
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
    // Hook contract: error message is normalized to a friendly i18n-ready
    // string (NOT the raw "encoder down" / Axios stack). Using getErrorMessage
    // — mocked in test-utils to return err.message — the hook is expected to
    // wrap the AppError with a stable user message keyed off the 503 code.
    const message = result.current.error?.message ?? '';
    expect(message.length).toBeGreaterThan(0);
    expect(message).not.toMatch(/Network Error/i);
    // It must reference the encoder/unavailable concept — exact wording is
    // owned by the green editor (i18n key `chat.compare.error.unavailable`),
    // but the mapped message must not leak the raw axios "encoder down".
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
    // Mutation policy: 4xx is terminal — exactly one service attempt.
    expect(mockCompare).toHaveBeenCalledTimes(1);
  });
});
