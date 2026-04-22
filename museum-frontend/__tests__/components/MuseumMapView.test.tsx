/**
 * MuseumMapView tests — mocks @maplibre/maplibre-react-native so the component
 * can be rendered without the native module, exposing callbacks and
 * GeoJSON data as props we can assert against.
 */
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

jest.mock('@maplibre/maplibre-react-native', () => {
  const ReactMock = require('react');
  const { View } = require('react-native');

  return {
    __esModule: true,
    Map: ({
      children,
      onRegionDidChange,
      onDidFailLoadingMap,
      accessibilityLabel,
      accessibilityHint,
    }: Record<string, unknown>) =>
      ReactMock.createElement(
        View,
        {
          testID: 'maplibre-map',
          onRegionDidChange,
          onDidFailLoadingMap,
          accessibilityLabel,
          accessibilityHint,
        },
        children,
      ),
    Camera: ReactMock.forwardRef(function Camera(_props: Record<string, unknown>, _ref: unknown) {
      return ReactMock.createElement(View, { testID: 'maplibre-camera' });
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

import { act, render, screen } from '@testing-library/react-native';

import { MuseumMapView } from '@/features/museum/ui/MuseumMapView';

import { makeMuseumWithDistance as makeMuseum } from '../helpers/factories/museum.factories';

describe('MuseumMapView', () => {
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
});
