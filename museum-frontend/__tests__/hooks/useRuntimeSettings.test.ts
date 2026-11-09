import { nonNull } from '@/__tests__/helpers/nonNull';
import { renderHook, waitFor } from '@testing-library/react-native';
import { useRuntimeSettings } from '@/features/settings/application/useRuntimeSettings';
import { useRuntimeSettingsStore } from '@/features/settings/infrastructure/runtimeSettingsStore';
import type { RuntimeSettings } from '@/features/settings/runtimeSettings';

const mockLoadRuntimeSettings = jest.fn<Promise<RuntimeSettings>, []>();

jest.mock('@/features/settings/runtimeSettings', () => ({
  loadRuntimeSettings: (...args: unknown[]) => mockLoadRuntimeSettings(),
  defaults: {
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

describe('useRuntimeSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useRuntimeSettingsStore.setState({
      defaultMuseumMode: true,
      guideLevel: 'beginner',
      _hydrated: true,
    });
    mockLoadRuntimeSettings.mockResolvedValue({
      defaultMuseumMode: true,
      guideLevel: 'beginner',
    });
  });

  it('returns default values before settings are hydrated', () => {
    useRuntimeSettingsStore.setState({ _hydrated: false });
    mockLoadRuntimeSettings.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useRuntimeSettings());

    expect(result.current.locale).toBe('en');
    expect(result.current.museumMode).toBe(true);
    expect(result.current.guideLevel).toBe('beginner');
    expect(result.current.isLoading).toBe(true);
  });

  it('returns stored values when the store is hydrated', () => {
    useRuntimeSettingsStore.setState({
      defaultMuseumMode: false,
      guideLevel: 'expert',
      _hydrated: true,
    });

    const { result } = renderHook(() => useRuntimeSettings());

    expect(result.current.isLoading).toBe(false);
    expect(result.current.museumMode).toBe(false);
    expect(result.current.guideLevel).toBe('expert');
  });

  it('returns intermediate guideLevel when store has intermediate', () => {
    useRuntimeSettingsStore.setState({
      defaultMuseumMode: true,
      guideLevel: 'intermediate',
      _hydrated: true,
    });

    const { result } = renderHook(() => useRuntimeSettings());

    expect(result.current.isLoading).toBe(false);
    expect(result.current.guideLevel).toBe('intermediate');
  });

  it('handles the cancelled effect cleanup (no stale update)', () => {
    useRuntimeSettingsStore.setState({ _hydrated: false });

    let resolvePromise: ((value: RuntimeSettings) => void) | undefined;
    mockLoadRuntimeSettings.mockReturnValue(
      new Promise<RuntimeSettings>((resolve) => {
        resolvePromise = resolve;
      }),
    );

    const { result, unmount } = renderHook(() => useRuntimeSettings());

    expect(result.current.isLoading).toBe(true);

    unmount();

    nonNull(resolvePromise)({
      defaultMuseumMode: false,
      guideLevel: 'expert',
    });
  });

  it('does not call loadRuntimeSettings when store is already hydrated', () => {
    useRuntimeSettingsStore.setState({ _hydrated: true });

    const { result } = renderHook(() => useRuntimeSettings());

    expect(result.current.isLoading).toBe(false);
    expect(mockLoadRuntimeSettings).not.toHaveBeenCalled();
  });
});
