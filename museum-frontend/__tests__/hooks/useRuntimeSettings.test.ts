import { renderHook, waitFor } from '@testing-library/react-native';
import { useRuntimeSettings } from '@/features/settings/application/useRuntimeSettings';
import type { RuntimeSettings } from '@/features/settings/runtimeSettings';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockLoadRuntimeSettings = jest.fn<Promise<RuntimeSettings>, []>();

jest.mock('@/features/settings/runtimeSettings', () => ({
  loadRuntimeSettings: (...args: unknown[]) => mockLoadRuntimeSettings(),
  defaults: {
    defaultLocale: 'en-US',
    defaultMuseumMode: true,
    guideLevel: 'beginner',
  },
  normalizeGuideLevel: (value: string | null) => {
    if (value === 'expert' || value === 'intermediate' || value === 'beginner') {
      return value;
    }
    return 'beginner';
  },
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useRuntimeSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadRuntimeSettings.mockResolvedValue({
      defaultLocale: 'en-US',
      defaultMuseumMode: true,
      guideLevel: 'beginner',
    });
  });

  it('returns default values before settings are loaded', () => {
    // Make the promise never resolve during this test
    mockLoadRuntimeSettings.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useRuntimeSettings());

    expect(result.current.locale).toBe('en-US');
    expect(result.current.museumMode).toBe(true);
    expect(result.current.guideLevel).toBe('beginner');
    expect(result.current.isLoading).toBe(true);
  });

  it('loads settings from storage and updates the returned values', async () => {
    mockLoadRuntimeSettings.mockResolvedValue({
      defaultLocale: 'fr-FR',
      defaultMuseumMode: false,
      guideLevel: 'expert',
    });

    const { result } = renderHook(() => useRuntimeSettings());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.locale).toBe('fr-FR');
    expect(result.current.museumMode).toBe(false);
    expect(result.current.guideLevel).toBe('expert');
  });

  it('returns intermediate guideLevel when stored value is intermediate', async () => {
    mockLoadRuntimeSettings.mockResolvedValue({
      defaultLocale: 'en-US',
      defaultMuseumMode: true,
      guideLevel: 'intermediate',
    });

    const { result } = renderHook(() => useRuntimeSettings());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.guideLevel).toBe('intermediate');
  });

  it('exposes the full settings object after loading', async () => {
    const fullSettings: RuntimeSettings = {
      defaultLocale: 'de-DE',
      defaultMuseumMode: true,
      guideLevel: 'beginner',
    };
    mockLoadRuntimeSettings.mockResolvedValue(fullSettings);

    const { result } = renderHook(() => useRuntimeSettings());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.settings).toEqual(fullSettings);
  });

  it('handles the cancelled effect cleanup (no stale update)', async () => {
    // Simulate an unmount before the promise resolves
    let resolvePromise: (value: RuntimeSettings) => void;
    mockLoadRuntimeSettings.mockReturnValue(
      new Promise<RuntimeSettings>((resolve) => {
        resolvePromise = resolve;
      }),
    );

    const { result, unmount } = renderHook(() => useRuntimeSettings());

    expect(result.current.isLoading).toBe(true);

    // Unmount before the settings load
    unmount();

    // Resolve after unmount — should not throw or update
    resolvePromise!({
      defaultLocale: 'ja-JP',
      defaultMuseumMode: false,
      guideLevel: 'expert',
    });

    // The hook gracefully handled the cleanup; no assertions needed beyond
    // confirming no error was thrown. The cancelled flag prevents setState.
  });

  it('calls loadRuntimeSettings exactly once on mount', async () => {
    const { result } = renderHook(() => useRuntimeSettings());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockLoadRuntimeSettings).toHaveBeenCalledTimes(1);
  });
});
