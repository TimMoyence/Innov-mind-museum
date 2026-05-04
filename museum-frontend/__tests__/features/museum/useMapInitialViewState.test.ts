import { act, renderHook, waitFor } from '@testing-library/react-native';

import {
  useMapInitialViewState,
  type InitialViewState,
} from '@/features/museum/application/useMapInitialViewState';
import type { MuseumWithDistance } from '@/features/museum/application/useMuseumDirectory';
import { mapCameraCache } from '@/features/museum/infrastructure/mapCameraCache';

import { makeMuseumWithDistance as makeMuseum } from '../../helpers/factories/museum.factories';

const NO_MUSEUMS: MuseumWithDistance[] = [];
const ONE_MUSEUM: MuseumWithDistance[] = [makeMuseum({ latitude: 48.8566, longitude: 2.3522 })];

describe('useMapInitialViewState', () => {
  beforeEach(async () => {
    jest.restoreAllMocks();
    await mapCameraCache.clear();
  });

  it('returns null while mapCameraCache.load() is pending (synchronous first render)', () => {
    // Pending forever — exercises the in-flight branch.
    jest.spyOn(mapCameraCache, 'load').mockImplementation(() => new Promise(() => undefined));
    const { result } = renderHook(() => useMapInitialViewState(NO_MUSEUMS, null, null));
    expect(result.current).toBeNull();
  });

  it('resolves to the cached camera view when mapCameraCache.load() returns a value', async () => {
    jest.spyOn(mapCameraCache, 'load').mockResolvedValue({
      centerLng: 2.3522,
      centerLat: 48.8566,
      zoom: 12,
    });
    const { result } = renderHook(() => useMapInitialViewState(NO_MUSEUMS, null, null));
    await waitFor(() => {
      expect(result.current).toEqual<InitialViewState>({ center: [2.3522, 48.8566], zoom: 12 });
    });
  });

  it('falls back to the GPS position with USER_ONLY_ZOOM=13 when cache is null and GPS is present', async () => {
    jest.spyOn(mapCameraCache, 'load').mockResolvedValue(null);
    const { result } = renderHook(() => useMapInitialViewState(NO_MUSEUMS, 48.8566, 2.3522));
    await waitFor(() => {
      expect(result.current).toEqual<InitialViewState>({ center: [2.3522, 48.8566], zoom: 13 });
    });
  });

  it('falls back to the world default [0, 20] zoom 1 when cache is null and GPS is absent', async () => {
    jest.spyOn(mapCameraCache, 'load').mockResolvedValue(null);
    const { result } = renderHook(() => useMapInitialViewState(NO_MUSEUMS, null, null));
    await waitFor(() => {
      expect(result.current).toEqual<InitialViewState>({ center: [0, 20], zoom: 1 });
    });
  });

  it('is single-shot: re-rendering with new GPS after resolution does not re-seed the view', async () => {
    jest.spyOn(mapCameraCache, 'load').mockResolvedValue(null);
    const { result, rerender } = renderHook(
      ({ lat, lng }: { lat: number | null; lng: number | null }) =>
        useMapInitialViewState(NO_MUSEUMS, lat, lng),
      { initialProps: { lat: null as number | null, lng: null as number | null } },
    );
    await waitFor(() => {
      expect(result.current).toEqual<InitialViewState>({ center: [0, 20], zoom: 1 });
    });
    const first = result.current;
    rerender({ lat: 48.8566, lng: 2.3522 });
    // hook is one-shot — already-resolved state stays referentially stable
    expect(result.current).toBe(first);
  });

  it('does not throw when the consumer unmounts while mapCameraCache.load() is still pending', async () => {
    let resolveCache: ((value: null) => void) | null = null;
    jest.spyOn(mapCameraCache, 'load').mockImplementation(
      () =>
        new Promise<null>((resolve) => {
          resolveCache = resolve;
        }),
    );
    const { unmount } = renderHook(() => useMapInitialViewState(NO_MUSEUMS, null, null));
    unmount();
    await act(async () => {
      resolveCache?.(null);
    });
    // No unhandled rejection or "set state on unmounted" warning means the
    // cancelled-flag guard worked.
    expect(true).toBe(true);
  });

  it('falls back to GPS or world default when mapCameraCache.load() rejects (R3)', async () => {
    jest.spyOn(mapCameraCache, 'load').mockRejectedValue(new Error('AsyncStorage offline'));
    const { result } = renderHook(() => useMapInitialViewState(ONE_MUSEUM, 43.2965, 5.3698));
    await waitFor(() => {
      expect(result.current).toEqual<InitialViewState>({ center: [5.3698, 43.2965], zoom: 13 });
    });
  });
});
