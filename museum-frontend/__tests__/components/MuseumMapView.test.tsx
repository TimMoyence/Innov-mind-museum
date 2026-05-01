/**
 * MuseumMapView tests — mocks @maplibre/maplibre-react-native so the component
 * can be rendered without the native module, exposing callbacks and
 * GeoJSON data as props we can assert against.
 *
 * The Camera mock uses `useImperativeHandle` to expose shared jest.fn()
 * instances for `fitBounds` + `flyTo` (accessible via `mockCameraApi`).
 * `Map` also forwards `onDidFinishLoadingMap` so tests can trigger the
 * retry-fit codepath, and captures `initialViewState` off Camera so the
 * P0 cache-restore behavior can be asserted without a real map.
 */

// Shared jest.fn() refs for the mocked Camera ref. Re-used across every
// test — reset via `mockCameraApi.reset()` in beforeEach so each test starts
// with a clean call log.
export const mockCameraApi = {
  fitBounds: jest.fn(),
  flyTo: jest.fn(),
  lastInitialViewState: null as null | { center: [number, number]; zoom: number },
  reset() {
    this.fitBounds.mockReset();
    this.flyTo.mockReset();
    this.lastInitialViewState = null;
  },
};

jest.mock('@/shared/ui/ThemeContext', () => ({
  useTheme: () => ({
    theme: {
      cardBorder: '#ccc',
      pageGradient: ['#EAF2FF', '#D8E8FF', '#D5F0FF'],
      textPrimary: '#111',
    },
    isDark: false,
  }),
}));

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
}));

jest.mock('@/features/diagnostics/PerfOverlay', () => ({
  PerfOverlay: () => null,
}));

// ── NetInfo — default to wifi; individual tests can override ─────────────────
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    fetch: jest.fn(() => Promise.resolve({ type: 'wifi', isConnected: true, details: null })),
  },
}));

// ── offlinePackChoiceStore — isolated per test via zustand reset util ─────────
jest.mock('@/features/museum/infrastructure/offlinePackChoiceStore', () => {
  const { create } = require('zustand') as { create: typeof ZustandCreate };
  const mockStore = create<{
    choices: Record<string, { decision: 'accepted' | 'declined'; recordedAt: string }>;
    acceptOfflinePack: (cityId: string) => void;
    declineOfflinePack: (cityId: string) => void;
    getChoice: (cityId: string) => { decision: string } | undefined;
    clearChoice: (cityId: string) => void;
  }>()((set, get) => ({
    choices: {},
    acceptOfflinePack: (cityId: string) => {
      set((s) => ({
        choices: {
          ...s.choices,
          [cityId]: { decision: 'accepted', recordedAt: new Date().toISOString() },
        },
      }));
    },
    declineOfflinePack: (cityId: string) => {
      set((s) => ({
        choices: {
          ...s.choices,
          [cityId]: { decision: 'declined', recordedAt: new Date().toISOString() },
        },
      }));
    },
    getChoice: (cityId: string) => get().choices[cityId],
    clearChoice: (cityId: string) => {
      set((s) => {
        const { [cityId]: _removed, ...rest } = s.choices;
        return { choices: rest };
      });
    },
  }));
  return { useOfflinePackChoiceStore: mockStore };
});

// ── OfflinePackPrompt — lightweight stub that renders testID-bearing buttons ──
jest.mock('@/features/museum/ui/OfflinePackPrompt', () => {
  const { View, Pressable, Text } = require('react-native');
  return {
    OfflinePackPrompt: ({
      visible,
      cityName,
      onAccept,
      onDecline,
      testID,
    }: {
      visible: boolean;
      cityId: string;
      cityName: string;
      onAccept: () => void;
      onDecline: () => void;
      testID?: string;
    }) => {
      if (!visible) return null;
      return (
        <View testID={testID ?? 'offline-prompt'}>
          <Text testID={`${testID ?? 'offline-prompt'}-city`}>{cityName}</Text>
          <Pressable testID={`${testID ?? 'offline-prompt'}-accept`} onPress={onAccept} />
          <Pressable testID={`${testID ?? 'offline-prompt'}-decline`} onPress={onDecline} />
        </View>
      );
    },
  };
});

jest.mock('@maplibre/maplibre-react-native', () => {
  const ReactMock = require('react');
  const { View } = require('react-native');

  return {
    __esModule: true,
    Map: ({
      children,
      onRegionDidChange,
      onDidFailLoadingMap,
      onDidFinishLoadingMap,
      accessibilityLabel,
      accessibilityHint,
    }: Record<string, unknown>) =>
      ReactMock.createElement(
        View,
        {
          testID: 'maplibre-map',
          onRegionDidChange,
          onDidFailLoadingMap,
          onDidFinishLoadingMap,
          accessibilityLabel,
          accessibilityHint,
        },
        children,
      ),
    Camera: ReactMock.forwardRef(function Camera(
      props: { initialViewState?: { center: [number, number]; zoom: number } },
      ref: unknown,
    ) {
      ReactMock.useImperativeHandle(ref, () => ({
        fitBounds: (...args: unknown[]) => mockCameraApi.fitBounds(...args),
        flyTo: (...args: unknown[]) => mockCameraApi.flyTo(...args),
      }));
      // Capture the latest initialViewState so tests can assert the camera
      // started on the cache / GPS / default view.
      if (props.initialViewState) {
        mockCameraApi.lastInitialViewState = props.initialViewState;
      }
      return ReactMock.createElement(View, {
        testID: 'maplibre-camera',
        accessibilityValue: { text: JSON.stringify(props.initialViewState ?? null) },
      });
    }),
    GeoJSONSource: ({ id, data, children, onPress }: Record<string, unknown>) =>
      ReactMock.createElement(
        View,
        {
          testID: `source-${String(id)}`,
          onPress,
          accessibilityValue: { text: JSON.stringify(data) },
        },
        children,
      ),
    Layer: ({ id }: Record<string, unknown>) =>
      ReactMock.createElement(View, { testID: `layer-${String(id)}` }),
    LogManager: {
      setLogLevel: jest.fn(),
      onLog: jest.fn(),
      start: jest.fn(),
    },
  };
});

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { create as ZustandCreate } from 'zustand';

import { MuseumMapView } from '@/features/museum/ui/MuseumMapView';
import { mapCameraCache } from '@/features/museum/infrastructure/mapCameraCache';

import { makeMuseumWithDistance as makeMuseum } from '../helpers/factories/museum.factories';

describe('MuseumMapView', () => {
  beforeEach(async () => {
    // Restore any spies from a previous test (e.g. spyOn(mapCameraCache.save))
    // so they don't accumulate calls across the suite, then reset the Camera
    // imperative-handle call logs + cached initialViewState capture.
    jest.restoreAllMocks();
    mockCameraApi.reset();
    // Clear any persisted camera from a previous test — mapCameraCache is
    // backed by AsyncStorage which persists across jest test cases.
    await mapCameraCache.clear();
  });

  it('renders the MapLibre surface with the museums source', async () => {
    render(
      <MuseumMapView
        museums={[makeMuseum({ latitude: 48.8566, longitude: 2.3522 })]}
        userLatitude={48.85}
        userLongitude={2.35}
      />,
    );
    // initialViewState resolves asynchronously (AsyncStorage lookup in mapCameraCache).
    expect(await screen.findByTestId('maplibre-map')).toBeTruthy();
    expect(screen.getByTestId('source-museums')).toBeTruthy();
    expect(screen.getByTestId('layer-museum-points')).toBeTruthy();
  });

  it('omits the user-position source when location is unavailable', async () => {
    render(<MuseumMapView museums={[makeMuseum()]} userLatitude={null} userLongitude={null} />);
    await screen.findByTestId('maplibre-map');
    expect(screen.queryByTestId('source-user-position')).toBeNull();
  });

  it('renders the empty-state overlay when the museum list is empty', async () => {
    render(<MuseumMapView museums={[]} userLatitude={null} userLongitude={null} />);
    // Empty overlay is announced as an alert with the i18n key as translation fallback.
    // Wait for the async initialViewState to resolve so the Map (and its empty overlay) mount.
    const alert = await screen.findByRole('alert');
    expect(alert).toBeTruthy();
  });

  it('filters out museums without coordinates from the GeoJSON payload', async () => {
    render(
      <MuseumMapView
        museums={[
          makeMuseum({ latitude: null, longitude: null }),
          makeMuseum({ latitude: 48.8566, longitude: 2.3522 }),
        ]}
        userLatitude={null}
        userLongitude={null}
      />,
    );
    const source = await screen.findByTestId('source-museums');
    const raw = (source.props.accessibilityValue as { text: string }).text;
    const payload = JSON.parse(raw) as { features: unknown[] };
    expect(payload.features).toHaveLength(1);
  });

  it('exposes the map a11y label and hint tied to the i18n keys', async () => {
    render(
      <MuseumMapView
        museums={[
          makeMuseum({ latitude: 48.85, longitude: 2.35 }),
          makeMuseum({ latitude: 48.86, longitude: 2.36 }),
          makeMuseum({ latitude: null, longitude: null }),
        ]}
        userLatitude={null}
        userLongitude={null}
      />,
    );
    const map = await screen.findByTestId('maplibre-map');
    // react-i18next without a backend echoes the key itself — we only assert
    // the component passed the right key to t(), and that the hint exists.
    expect(map.props.accessibilityLabel).toBe('museumDirectory.map_a11y_label');
    expect(map.props.accessibilityHint).toBe('museumDirectory.map_a11y_hint');
  });

  it('renders the load-error overlay when onDidFailLoadingMap fires', async () => {
    render(
      <MuseumMapView
        museums={[makeMuseum({ latitude: 48.85, longitude: 2.35 })]}
        userLatitude={null}
        userLongitude={null}
      />,
    );
    const map = await screen.findByTestId('maplibre-map');
    act(() => {
      (map.props.onDidFailLoadingMap as () => void)();
    });
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  // ── camera persistence and fit guards ──────────────────────────────────────
  // Protects the P0 fix: the Map is held until mapCameraCache resolves, the
  // restored view wins over GPS, and auto-fit is bounded so users zoomed into
  // a city aren't yanked out to a country-wide view on the next data refresh.

  describe('camera persistence and fit guards', () => {
    it('restores camera from mapCameraCache on mount when cache is valid', async () => {
      jest.spyOn(mapCameraCache, 'load').mockResolvedValue({
        centerLng: 2.35,
        centerLat: 48.85,
        zoom: 14,
      });

      render(
        <MuseumMapView
          museums={[makeMuseum({ latitude: 48.8566, longitude: 2.3522 })]}
          userLatitude={48.0}
          userLongitude={2.0}
        />,
      );

      await screen.findByTestId('maplibre-camera');
      expect(mockCameraApi.lastInitialViewState).toEqual({
        center: [2.35, 48.85],
        zoom: 14,
      });
    });

    it('falls back to user GPS when the camera cache is empty', async () => {
      jest.spyOn(mapCameraCache, 'load').mockResolvedValue(null);

      render(<MuseumMapView museums={[]} userLatitude={48.8566} userLongitude={2.3522} />);

      await screen.findByTestId('maplibre-camera');
      expect(mockCameraApi.lastInitialViewState).toEqual({
        center: [2.3522, 48.8566],
        zoom: 13,
      });
    });

    it('persists the camera on user-interaction region change, debounced', async () => {
      const saveSpy = jest.spyOn(mapCameraCache, 'save');

      render(
        <MuseumMapView
          museums={[makeMuseum({ latitude: 48.8566, longitude: 2.3522 })]}
          userLatitude={null}
          userLongitude={null}
        />,
      );

      const map = await screen.findByTestId('maplibre-map');
      const handleRegionDidChange = map.props.onRegionDidChange as (e: {
        nativeEvent: unknown;
      }) => void;

      act(() => {
        handleRegionDidChange({
          nativeEvent: {
            center: [2.1, 48.1],
            zoom: 10,
            bounds: [2.0, 48.0, 2.2, 48.2],
            userInteraction: true,
          },
        });
        handleRegionDidChange({
          nativeEvent: {
            center: [2.2, 48.2],
            zoom: 11,
            bounds: [2.1, 48.1, 2.3, 48.3],
            userInteraction: true,
          },
        });
        handleRegionDidChange({
          nativeEvent: {
            center: [2.3, 48.3],
            zoom: 12,
            bounds: [2.2, 48.2, 2.4, 48.4],
            userInteraction: true,
          },
        });
      });

      // save() is called synchronously on every region change — the debounce
      // lives INSIDE save() itself (see mapCameraCache). Assert save() was
      // invoked once per user pan with the right shape + flag.
      expect(saveSpy).toHaveBeenCalledTimes(3);
      expect(saveSpy).toHaveBeenLastCalledWith({ centerLng: 2.3, centerLat: 48.3, zoom: 12 }, true);
    });

    it('skips save when the region change was programmatic (userInteraction=false)', async () => {
      const saveSpy = jest.spyOn(mapCameraCache, 'save');

      render(
        <MuseumMapView
          museums={[makeMuseum({ latitude: 48.8566, longitude: 2.3522 })]}
          userLatitude={null}
          userLongitude={null}
        />,
      );

      const map = await screen.findByTestId('maplibre-map');
      const handleRegionDidChange = map.props.onRegionDidChange as (e: {
        nativeEvent: unknown;
      }) => void;

      act(() => {
        handleRegionDidChange({
          nativeEvent: {
            center: [2.1, 48.1],
            zoom: 10,
            bounds: [2.0, 48.0, 2.2, 48.2],
            userInteraction: false,
          },
        });
      });

      // save() IS called by the component — the cache itself is responsible
      // for skipping on `isUserInteraction=false`. Assert the correct flag
      // propagated so the cache can make that decision.
      expect(saveSpy).toHaveBeenCalledTimes(1);
      expect(saveSpy).toHaveBeenCalledWith({ centerLng: 2.1, centerLat: 48.1, zoom: 10 }, false);
    });

    it('skips fitBounds when the museum span exceeds 50km (e.g. full-France fallback)', async () => {
      jest.spyOn(mapCameraCache, 'load').mockResolvedValue(null);

      render(
        <MuseumMapView
          museums={[
            // Paris ↔ Marseille ≈ 660 km — way over the 50km MAX_FIT_SPAN.
            makeMuseum({ id: 1, name: 'Louvre', latitude: 48.8606, longitude: 2.3376 }),
            makeMuseum({ id: 2, name: 'MuCEM', latitude: 43.2965, longitude: 5.3698 }),
          ]}
          userLatitude={null}
          userLongitude={null}
        />,
      );

      await screen.findByTestId('maplibre-camera');

      // Trigger the onDidFinishLoadingMap retry path too (camera ref is ready
      // by then) — the guard still suppresses the country-wide fitBounds.
      const map = screen.getByTestId('maplibre-map');
      act(() => {
        (map.props.onDidFinishLoadingMap as () => void)();
      });

      expect(mockCameraApi.fitBounds).not.toHaveBeenCalled();
    });

    it('fits the camera at most once per mount for a reasonable dataset', async () => {
      jest.spyOn(mapCameraCache, 'load').mockResolvedValue(null);

      render(
        <MuseumMapView
          museums={[
            // All within Bordeaux proper — well below the 50km cap.
            makeMuseum({ id: 1, name: 'CAPC', latitude: 44.8495, longitude: -0.5688 }),
            makeMuseum({ id: 2, name: 'Aquitaine', latitude: 44.8333, longitude: -0.575 }),
            makeMuseum({ id: 3, name: 'Beaux-Arts', latitude: 44.8378, longitude: -0.5795 }),
          ]}
          userLatitude={null}
          userLongitude={null}
        />,
      );

      // `initialViewState` resolves asynchronously, so the data-driven effect
      // may run BEFORE cameraRef is populated. `handleDidFinishLoadingMap`
      // is the documented retry entrypoint once the Map is ready.
      await screen.findByTestId('maplibre-camera');
      const map = screen.getByTestId('maplibre-map');
      act(() => {
        (map.props.onDidFinishLoadingMap as () => void)();
      });
      expect(mockCameraApi.fitBounds).toHaveBeenCalledTimes(1);

      // Second load-finish must NOT re-fit — the hasFittedRef guard blocks
      // the retry after the first successful fit.
      act(() => {
        (map.props.onDidFinishLoadingMap as () => void)();
      });
      expect(mockCameraApi.fitBounds).toHaveBeenCalledTimes(1);
    });
  });

  // ── Offline-pack prompt ─────────────────────────────────────────────────────
  // Verifies T6.3: prompt surfaces when nearestCity is in catalog + wifi + no
  // prior choice, and that accept/decline record intent via the store.

  describe('offline pack prompt', () => {
    // Paris centroid — inside the Paris bounding box in cityCatalog.ts
    // [2.224, 48.815, 2.47, 48.902]
    const PARIS_LAT = 48.86;
    const PARIS_LNG = 2.35;

    beforeEach(() => {
      // Reset the in-process store choices before each test so decisions
      // from one test don't leak into the next.
      const { useOfflinePackChoiceStore } = jest.requireMock(
        '@/features/museum/infrastructure/offlinePackChoiceStore',
      );
      const state = useOfflinePackChoiceStore.getState();
      Object.keys(state.choices).forEach((id) => {
        state.clearChoice(id);
      });

      // Default: wifi connection
      const NetInfo = jest.requireMock('@react-native-community/netinfo');
      NetInfo.default.fetch.mockResolvedValue({ type: 'wifi', isConnected: true, details: null });
    });

    it('shows the prompt when nearest museum is in a catalog city + wifi + no prior choice', async () => {
      render(
        <MuseumMapView
          museums={[makeMuseum({ latitude: PARIS_LAT, longitude: PARIS_LNG, distanceMeters: 100 })]}
          userLatitude={PARIS_LAT}
          userLongitude={PARIS_LNG}
        />,
      );
      // Wait for map to mount and the NetInfo promise to resolve
      await screen.findByTestId('maplibre-map');
      expect(await screen.findByTestId('museum-map-offline-prompt')).toBeTruthy();
    });

    it('hides the prompt when the user already has a choice for that city', async () => {
      // Pre-record a decline for Paris before render
      const { useOfflinePackChoiceStore } = jest.requireMock(
        '@/features/museum/infrastructure/offlinePackChoiceStore',
      );
      useOfflinePackChoiceStore.getState().declineOfflinePack('paris');

      render(
        <MuseumMapView
          museums={[makeMuseum({ latitude: PARIS_LAT, longitude: PARIS_LNG, distanceMeters: 100 })]}
          userLatitude={PARIS_LAT}
          userLongitude={PARIS_LNG}
        />,
      );
      await screen.findByTestId('maplibre-map');
      // Give the NetInfo promise time to settle
      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.queryByTestId('museum-map-offline-prompt')).toBeNull();
    });

    it('records accepted decision and hides the prompt on accept', async () => {
      const { useOfflinePackChoiceStore } = jest.requireMock(
        '@/features/museum/infrastructure/offlinePackChoiceStore',
      );

      render(
        <MuseumMapView
          museums={[makeMuseum({ latitude: PARIS_LAT, longitude: PARIS_LNG, distanceMeters: 100 })]}
          userLatitude={PARIS_LAT}
          userLongitude={PARIS_LNG}
        />,
      );
      await screen.findByTestId('museum-map-offline-prompt');
      act(() => {
        fireEvent.press(screen.getByTestId('museum-map-offline-prompt-accept'));
      });
      expect(screen.queryByTestId('museum-map-offline-prompt')).toBeNull();
      expect(useOfflinePackChoiceStore.getState().choices.paris?.decision).toBe('accepted');
    });
  });
});
