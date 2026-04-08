/**
 * MuseumMapView tests — does NOT import test-utils because it mocks
 * WebView and theme directly to test the real component.
 */
jest.mock('@/shared/ui/ThemeContext', () => ({
  useTheme: () => ({
    theme: {
      cardBorder: '#ccc',
      pageGradient: ['#EAF2FF', '#D8E8FF', '#D5F0FF'],
    },
    isDark: false,
  }),
}));

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
}));

jest.mock('@/features/museum/infrastructure/leafletHtml', () => ({
  buildLeafletHtml: () => '<html><body>Map</body></html>',
}));

jest.mock('react-native-webview', () => {
  const { View } = require('react-native');
  const React = require('react');
  return {
    __esModule: true,
    WebView: React.forwardRef(function MockWebView(props: Record<string, unknown>, ref: unknown) {
      return React.createElement(View, { testID: 'webview', ref, ...props });
    }),
  };
});

import { render, screen } from '@testing-library/react-native';
import { MuseumMapView } from '@/features/museum/ui/MuseumMapView';

const makeMuseum = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  name: 'Test Museum',
  slug: 'test-museum',
  address: '123 Main St',
  description: 'A test museum',
  latitude: 48.8566,
  longitude: 2.3522,
  distance: 1.5,
  source: 'local' as const,
  museumType: 'general' as const,
  ...overrides,
});

describe('MuseumMapView', () => {
  it('renders WebView', () => {
    render(<MuseumMapView museums={[makeMuseum()]} userLatitude={48.85} userLongitude={2.35} />);
    expect(screen.getByTestId('webview')).toBeTruthy();
  });

  it('renders without user location', () => {
    render(<MuseumMapView museums={[makeMuseum()]} userLatitude={null} userLongitude={null} />);
    expect(screen.getByTestId('webview')).toBeTruthy();
  });

  it('renders with empty museum list', () => {
    render(<MuseumMapView museums={[]} userLatitude={null} userLongitude={null} />);
    expect(screen.getByTestId('webview')).toBeTruthy();
  });

  it('renders with museums that have null coordinates', () => {
    render(
      <MuseumMapView
        museums={[makeMuseum({ latitude: null, longitude: null })]}
        userLatitude={null}
        userLongitude={null}
      />,
    );
    expect(screen.getByTestId('webview')).toBeTruthy();
  });
});
