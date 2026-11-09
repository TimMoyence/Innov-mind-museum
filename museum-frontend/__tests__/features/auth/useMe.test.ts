import '@/__tests__/helpers/test-utils';
import { waitFor } from '@testing-library/react-native';

import { renderHookWithQueryClient } from '@/__tests__/helpers/data/renderWithQueryClient';

const mockMe = jest.fn();

jest.mock('@/features/auth/infrastructure/authApi', () => ({
  authService: {
    me: (...args: unknown[]) => mockMe(...args),
  },
}));

import { useMe } from '@/features/auth/application/useMe';

describe('useMe (Spec C T2.10)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches the user profile from authService.me on mount', async () => {
    const profile = {
      user: {
        id: 1,
        email: 'visitor@test.com',
        role: 'visitor' as const,
        onboardingCompleted: true,
        ttsVoice: 'echo' as const,
      },
    };
    mockMe.mockResolvedValueOnce(profile);

    const { result } = renderHookWithQueryClient(() => useMe());

    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });

    expect(mockMe).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual(profile);
  });

  it('exposes the ttsVoice field on the user envelope so the settings screen can read it', async () => {
    mockMe.mockResolvedValueOnce({
      user: {
        id: 7,
        email: 'visitor@test.com',
        role: 'visitor' as const,
        onboardingCompleted: true,
        ttsVoice: 'nova' as const,
      },
    });

    const { result } = renderHookWithQueryClient(() => useMe());

    await waitFor(() => {
      expect(result.current.data?.user?.ttsVoice).toBe('nova');
    });
  });

  it('exposes null ttsVoice when the user has no preference set', async () => {
    mockMe.mockResolvedValueOnce({
      user: {
        id: 7,
        email: 'visitor@test.com',
        role: 'visitor' as const,
        onboardingCompleted: true,
        ttsVoice: null,
      },
    });

    const { result } = renderHookWithQueryClient(() => useMe());

    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });

    expect(result.current.data?.user?.ttsVoice).toBeNull();
  });

  it('surfaces errors via the AppError-typed error channel', async () => {
    const error = new Error('boom');
    mockMe.mockRejectedValueOnce(error);

    const { result } = renderHookWithQueryClient(() => useMe());

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(result.current.error).toBeDefined();
  });

  describe('TD-TQ-01 — signal propagation', () => {
    it('forwards an AbortSignal to authService.me() via QueryFunctionContext', async () => {
      mockMe.mockImplementationOnce(() => new Promise(() => {}));

      renderHookWithQueryClient(() => useMe());

      await waitFor(() => {
        expect(mockMe).toHaveBeenCalledTimes(1);
      });

      const firstArg = mockMe.mock.calls[0]?.[0];
      expect(firstArg).toBeDefined();
      expect(firstArg).toHaveProperty('signal');
      expect((firstArg as { signal: unknown }).signal).toBeInstanceOf(AbortSignal);
    });

    it("flips the captured signal's .aborted flag when queryClient.cancelQueries is called", async () => {
      mockMe.mockImplementationOnce(() => new Promise(() => {}));

      const { client } = renderHookWithQueryClient(() => useMe());

      await waitFor(() => {
        expect(mockMe).toHaveBeenCalledTimes(1);
      });
      const captured = mockMe.mock.calls[0]?.[0] as { signal: AbortSignal } | undefined;
      expect(captured?.signal).toBeInstanceOf(AbortSignal);
      expect(captured?.signal.aborted).toBe(false);

      await client.cancelQueries({ queryKey: ['user', 'me'] });

      expect(captured?.signal.aborted).toBe(true);
    });
  });
});
