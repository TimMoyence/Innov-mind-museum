import '../helpers/test-utils';
import { render, screen } from '@testing-library/react-native';

// ── Screen-specific mocks ────────────────────────────────────────────────────

jest.mock('@/features/museum/application/useLocation', () => ({
  useLocation: () => ({
    latitude: 48.8566,
    longitude: 2.3522,
    status: 'granted',
  }),
}));

jest.mock('@/features/museum/application/useGeofencePreCache', () => ({
  useGeofencePreCache: () => undefined,
}));

jest.mock('@/features/museum/application/useMuseumDirectory', () => ({
  useMuseumDirectory: () => ({
    museums: [],
    isLoading: false,
    searchQuery: '',
    setSearchQuery: jest.fn(),
    refresh: jest.fn(),
  }),
}));

jest.mock('@/features/museum/ui/MuseumDirectoryList', () => {
  const { View } = require('react-native');
  return {
    MuseumDirectoryList: (props: any) => <View testID="museum-directory-list" />,
  };
});

jest.mock('@/features/museum/ui/MuseumMapView', () => {
  const { View } = require('react-native');
  return {
    MuseumMapView: (props: any) => <View testID="museum-map-view" />,
  };
});

jest.mock('@/features/museum/ui/ViewModeToggle', () => {
  const { View } = require('react-native');
  return {
    ViewModeToggle: (props: any) => <View testID="view-mode-toggle" />,
  };
});

jest.mock('@/features/museum/ui/MuseumSheet', () => {
  const { View } = require('react-native');
  return {
    MuseumSheet: ({ museum }: { museum: unknown }) =>
      museum ? <View testID="museum-sheet" /> : null,
  };
});

const mockStartConversation = jest.fn();
jest.mock('@/features/chat/application/useStartConversation', () => ({
  useStartConversation: () => ({
    isCreating: false,
    error: null,
    setError: jest.fn(),
    startConversation: mockStartConversation,
  }),
}));

import MuseumsScreen from '@/app/(tabs)/museums';

describe('MuseumsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders screen title', () => {
    render(<MuseumsScreen />);
    expect(screen.getByText('museumDirectory.title')).toBeTruthy();
  });

  it('renders in list mode by default', () => {
    render(<MuseumsScreen />);
    expect(screen.getByTestId('museum-directory-list')).toBeTruthy();
    expect(screen.queryByTestId('museum-map-view')).toBeNull();
  });

  it('renders view mode toggle', () => {
    render(<MuseumsScreen />);
    expect(screen.getByTestId('view-mode-toggle')).toBeTruthy();
  });

  it('does not show location denied message when granted', () => {
    render(<MuseumsScreen />);
    expect(screen.queryByText('museumDirectory.location_denied')).toBeNull();
  });
});
