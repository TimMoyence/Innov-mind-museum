import { act, renderHook, waitFor } from '@testing-library/react-native';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockUpdateContentPreferences = jest.fn();
jest.mock('@/features/settings/infrastructure/userProfileApi', () => ({
  userProfileApi: {
    updateContentPreferences: (...args: unknown[]) => mockUpdateContentPreferences(...args),
  },
}));

const mockCaptureException = jest.fn();
jest.mock('@sentry/react-native', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

jest.mock('@/shared/lib/errors', () => ({
  getErrorMessage: (err: unknown) =>
    err instanceof Error ? err.message : typeof err === 'string' ? err : String(err),
}));

import { useContentPreferences } from '@/features/settings/application/useContentPreferences';
import { useUserProfileStore } from '@/features/settings/infrastructure/userProfileStore';
import type { ContentPreference } from '@/shared/types/content-preference';

// ── Helpers ──────────────────────────────────────────────────────────────────

const resetStore = (initial: ContentPreference[] = []) => {
  useUserProfileStore.setState({ contentPreferences: initial });
};

describe('useContentPreferences', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStore([]);
  });

  // ── Initial state ─────────────────────────────────────────────────────────

  it('exposes the empty preferences array, no-error, not-saving as defaults', () => {
    const { result } = renderHook(() => useContentPreferences());
    expect(result.current.preferences).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.isSaving).toBe(false);
  });

  it('reflects the current store contents in `preferences`', () => {
    resetStore(['history', 'artist']);
    const { result } = renderHook(() => useContentPreferences());
    expect(result.current.preferences).toEqual(['history', 'artist']);
  });

  // ── isSelected ────────────────────────────────────────────────────────────

  it('isSelected returns true only for preferences currently in the array', () => {
    resetStore(['history']);
    const { result } = renderHook(() => useContentPreferences());
    expect(result.current.isSelected('history')).toBe(true);
    expect(result.current.isSelected('technique')).toBe(false);
    expect(result.current.isSelected('artist')).toBe(false);
  });

  // ── toggle: optimistic happy path ─────────────────────────────────────────

  it('optimistically adds the preference, calls the API with the toggled set, and aligns with the persisted response', async () => {
    mockUpdateContentPreferences.mockResolvedValueOnce(['technique', 'history']);
    const { result } = renderHook(() => useContentPreferences());

    await act(async () => {
      await result.current.toggle('history');
    });

    // PATCH was sent with the optimistic ['history'] set.
    expect(mockUpdateContentPreferences).toHaveBeenCalledTimes(1);
    expect(mockUpdateContentPreferences).toHaveBeenCalledWith(['history']);
    // After resolution, the store is aligned to the canonical server order.
    expect(result.current.preferences).toEqual(['technique', 'history']);
    expect(result.current.error).toBeNull();
    expect(result.current.isSaving).toBe(false);
  });

  it('removes a preference that was previously selected', async () => {
    resetStore(['history', 'artist']);
    mockUpdateContentPreferences.mockResolvedValueOnce(['artist']);
    const { result } = renderHook(() => useContentPreferences());

    await act(async () => {
      await result.current.toggle('history');
    });

    expect(mockUpdateContentPreferences).toHaveBeenCalledWith(['artist']);
    expect(result.current.preferences).toEqual(['artist']);
  });

  // ── toggle: failure → rollback ────────────────────────────────────────────

  it('on PATCH failure restores the previous preferences and surfaces the error message', async () => {
    resetStore(['history']);
    mockUpdateContentPreferences.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useContentPreferences());

    await act(async () => {
      await result.current.toggle('artist');
    });

    // Previous (pre-toggle) value is restored.
    expect(result.current.preferences).toEqual(['history']);
    expect(result.current.error).toBe('boom');
    expect(result.current.isSaving).toBe(false);
    // Sentry capture was invoked with the toggle flow tag.
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockCaptureException).toHaveBeenCalledWith(expect.any(Error), {
      tags: { flow: 'contentPreferences.toggle' },
    });
  });

  it('clearError resets the error to null', async () => {
    mockUpdateContentPreferences.mockRejectedValueOnce(new Error('network'));
    const { result } = renderHook(() => useContentPreferences());

    await act(async () => {
      await result.current.toggle('history');
    });
    expect(result.current.error).toBe('network');

    act(() => {
      result.current.clearError();
    });
    await waitFor(() => {
      expect(result.current.error).toBeNull();
    });
  });

  // ── toggle: mutex ─────────────────────────────────────────────────────────

  it('refuses concurrent toggles while a PATCH is in flight (single inflight request)', async () => {
    let resolveFirst: (value: ContentPreference[]) => void = () => undefined;
    mockUpdateContentPreferences.mockImplementationOnce(
      () =>
        new Promise<ContentPreference[]>((resolve) => {
          resolveFirst = resolve;
        }),
    );

    const { result } = renderHook(() => useContentPreferences());

    // Fire the first toggle without awaiting — it stays in flight.
    let firstToggle: Promise<void> = Promise.resolve();
    act(() => {
      firstToggle = result.current.toggle('history');
    });

    // Second toggle should bail out immediately (mutex) — no extra API call.
    await act(async () => {
      await result.current.toggle('artist');
    });
    expect(mockUpdateContentPreferences).toHaveBeenCalledTimes(1);

    // Now resolve the first call and let the hook settle.
    await act(async () => {
      resolveFirst(['history']);
      await firstToggle;
    });

    // After settle the mutex is released — a third toggle is allowed.
    mockUpdateContentPreferences.mockResolvedValueOnce(['history', 'technique']);
    await act(async () => {
      await result.current.toggle('technique');
    });
    expect(mockUpdateContentPreferences).toHaveBeenCalledTimes(2);
  });
});
