/**
 * Tests for {@link useUpdateTtsVoice} (Spec C T2.8).
 *
 * Covers the TanStack mutation hook that posts the chosen TTS voice to
 * `PATCH /api/auth/tts-voice` via {@link authService.updateTtsVoice} and
 * invalidates the `['me']` profile query on success so the UI re-reads
 * the freshly persisted value.
 */
import '@/__tests__/helpers/test-utils';
import { act, waitFor } from '@testing-library/react-native';

import { renderHookWithQueryClient } from '@/__tests__/helpers/data/renderWithQueryClient';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockUpdateTtsVoice = jest.fn();

jest.mock('@/features/auth/infrastructure/authApi', () => ({
  authService: {
    updateTtsVoice: (...args: unknown[]) => mockUpdateTtsVoice(...args),
  },
}));

import { useUpdateTtsVoice } from '@/features/settings/application/useUpdateTtsVoice';

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useUpdateTtsVoice (Spec C T2.8)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('posts the chosen voice and returns the new value', async () => {
    mockUpdateTtsVoice.mockResolvedValueOnce({ ttsVoice: 'echo' });

    const { result } = renderHookWithQueryClient(() => useUpdateTtsVoice());

    let mutationResult: unknown;
    await act(async () => {
      mutationResult = await result.current.mutateAsync('echo');
    });

    expect(mockUpdateTtsVoice).toHaveBeenCalledTimes(1);
    expect(mockUpdateTtsVoice).toHaveBeenCalledWith('echo');
    expect(mutationResult).toEqual({ ttsVoice: 'echo' });
  });

  it('passes null to reset', async () => {
    mockUpdateTtsVoice.mockResolvedValueOnce({ ttsVoice: null });

    const { result } = renderHookWithQueryClient(() => useUpdateTtsVoice());

    let mutationResult: unknown;
    await act(async () => {
      mutationResult = await result.current.mutateAsync(null);
    });

    expect(mockUpdateTtsVoice).toHaveBeenCalledTimes(1);
    expect(mockUpdateTtsVoice).toHaveBeenCalledWith(null);
    expect(mutationResult).toEqual({ ttsVoice: null });
  });

  it("invalidates the ['me'] query on success so the profile re-reads the new value", async () => {
    mockUpdateTtsVoice.mockResolvedValueOnce({ ttsVoice: 'nova' });

    const { result, client } = renderHookWithQueryClient(() => useUpdateTtsVoice());
    const invalidateSpy = jest.spyOn(client, 'invalidateQueries');

    await act(async () => {
      await result.current.mutateAsync('nova');
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['me'] });
    });
  });
});
