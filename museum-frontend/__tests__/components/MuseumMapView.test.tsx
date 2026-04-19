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

jest.mock('@maplibre/maplibre-react-native', () => {
  const ReactMock = require('react');
  const { View } = require('react-native');

  return {
    __esModule: true,
    Map: ({ children, onRegionDidChange, ...rest }: Record<string, unknown>) =>
      ReactMock.createElement(
        View,
        {
          testID: 'maplibre-map',
          onRegionDidChange,
          accessibilityLabel: JSON.stringify({ hasStyle: Boolean(rest.mapStyle) }),
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
          accessibilityLabel: JSON.stringify(data),
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

import { render, screen } from '@testing-library/react-native';

import { MuseumMapView } from '@/features/museum/ui/MuseumMapView';

import { makeMuseumWithDistance as makeMuseum } from '../helpers/factories/museum.factories';

describe('MuseumMapView', () => {
  it('renders the MapLibre surface with the museums source', () => {
    render(
      <MuseumMapView
        museums={[makeMuseum({ latitude: 48.8566, longitude: 2.3522 })]}
        userLatitude={48.85}
        userLongitude={2.35}
      />,
    );
    expect(screen.getByTestId('maplibre-map')).toBeTruthy();
    expect(screen.getByTestId('source-museums')).toBeTruthy();
    expect(screen.getByTestId('layer-museum-points')).toBeTruthy();
  });

  it('omits the user-position source when location is unavailable', () => {
    render(<MuseumMapView museums={[makeMuseum()]} userLatitude={null} userLongitude={null} />);
    expect(screen.queryByTestId('source-user-position')).toBeNull();
  });

  it('renders the empty-state overlay when the museum list is empty', () => {
    render(<MuseumMapView museums={[]} userLatitude={null} userLongitude={null} />);
    // Empty overlay is announced as an alert with the i18n key as translation fallback
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('filters out museums without coordinates from the GeoJSON payload', () => {
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
    const source = screen.getByTestId('source-museums');
    const raw = source.props.accessibilityLabel as string;
    const payload = JSON.parse(raw) as { features: unknown[] };
    expect(payload.features).toHaveLength(1);
  });
});
