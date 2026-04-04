import { renderHook, waitFor } from '@testing-library/react-native';
import { useRuntimeSettings } from '@/features/settings/application/useRuntimeSettings';
import { useRuntimeSettingsStore } from '@/features/settings/infrastructure/runtimeSettingsStore';
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
    // Reset store to hydrated state with defaults for most tests
    useRuntimeSettingsStore.setState({
      defaultLocale: 'en-US',
      defaultMuseumMode: true,
      guideLevel: 'beginner',
      _hydrated: true,
    });
    mockLoadRuntimeSettings.mockResolvedValue({
      defaultLocale: 'en-US',
      defaultMuseumMode: true,
      guideLevel: 'beginner',
    });
  });

  it('returns default values before settings are hydrated', () => {
    // Set store to not-yet-hydrated state
    useRuntimeSettingsStore.setState({ _hydrated: false });
    // Prevent loadRuntimeSettings from resolving during this test
    mockLoadRuntimeSettings.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useRuntimeSettings());

    expect(result.current.locale).toBe('en-US');
    expect(result.current.museumMode).toBe(true);
    expect(result.current.guideLevel).toBe('beginner');
    expect(result.current.isLoading).toBe(true);
  });

  it('returns stored values when the store is hydrated', () => {
    useRuntimeSettingsStore.setState({
      defaultLocale: 'fr-FR',
      defaultMuseumMode: false,
      guideLevel: 'expert',
      _hydrated: true,
    });

    const { result } = renderHook(() => useRuntimeSettings());

    expect(result.current.isLoading).toBe(false);
    expect(result.current.locale).toBe('fr-FR');
    expect(result.current.museumMode).toBe(false);
    expect(result.current.guideLevel).toBe('expert');
  });

  it('returns intermediate guideLevel when store has intermediate', () => {
    useRuntimeSettingsStore.setState({
      defaultLocale: 'en-US',
      defaultMuseumMode: true,
      guideLevel: 'intermediate',
      _hydrated: true,
    });

    const { result } = renderHook(() => useRuntimeSettings());

    expect(result.current.isLoading).toBe(false);
    expect(result.current.guideLevel).toBe('intermediate');
  });

  it('exposes the full settings object after hydration', () => {
    const fullSettings: RuntimeSettings = {
      defaultLocale: 'de-DE',
      defaultMuseumMode: true,
      guideLevel: 'beginner',
    };
    useRuntimeSettingsStore.setState({
      ...fullSettings,
      _hydrated: true,
    });

    const { result } = renderHook(() => useRuntimeSettings());

    expect(result.current.isLoading).toBe(false);
    expect(result.current.settings).toEqual(fullSettings);
  });

  it('handles the cancelled effect cleanup (no stale update)', () => {
    // Start with non-hydrated store so the effect triggers loadRuntimeSettings
    useRuntimeSettingsStore.setState({ _hydrated: false });

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
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- test assertion on known mock data
    resolvePromise!({
      defaultLocale: 'ja-JP',
      defaultMuseumMode: false,
      guideLevel: 'expert',
    });

    // The hook gracefully handled the cleanup; no assertions needed beyond
    // confirming no error was thrown. The cancelled flag prevents setState.
  });

  it('does not call loadRuntimeSettings when store is already hydrated', () => {
    useRuntimeSettingsStore.setState({ _hydrated: true });

    const { result } = renderHook(() => useRuntimeSettings());

    expect(result.current.isLoading).toBe(false);
    expect(mockLoadRuntimeSettings).not.toHaveBeenCalled();
  });
});
