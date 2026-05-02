import '../helpers/test-utils';

import { AccessibilityInfo } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

// ── Screen-specific mocks ────────────────────────────────────────────────────
// Note: react-native-maps / maplibre / expo-location are NOT loaded — the screen
// pulls MuseumMapView via a `@/...` alias, which we stub below to avoid the
// native-module dependency tree.

interface MockLocation {
  latitude: number | null;
  longitude: number | null;
  status: 'granted' | 'denied' | 'undetermined';
  precision: 'fresh' | 'cached' | null;
  error: string | null;
}
const mockUseLocation = jest.fn(
  (): MockLocation => ({
    latitude: 48.8566,
    longitude: 2.3522,
    status: 'granted',
    precision: 'fresh',
    error: null,
  }),
);
jest.mock('@/features/museum/application/useLocation', () => ({
  useLocation: () => mockUseLocation(),
}));

jest.mock('@/features/museum/application/useGeofencePreCache', () => ({
  useGeofencePreCache: jest.fn(),
}));

const mockSetSearchQuery = jest.fn();
const mockRefresh = jest.fn();
const mockSearchInBounds = jest.fn();
const mockUseMuseumDirectory = jest.fn(() => ({
  museums: [] as readonly { id: number; name: string }[],
  isLoading: false,
  searchQuery: '',
  setSearchQuery: mockSetSearchQuery,
  refresh: mockRefresh,
  searchInBounds: mockSearchInBounds,
}));
jest.mock('@/features/museum/application/useMuseumDirectory', () => ({
  useMuseumDirectory: () => mockUseMuseumDirectory(),
}));

const mockOpenInNativeMaps = jest.fn();
jest.mock('@/features/museum/application/openInNativeMaps', () => ({
  openInNativeMaps: (input: unknown) => mockOpenInNativeMaps(input),
}));

const mockUseReducedMotion = jest.fn(() => false);
jest.mock('@/shared/ui/hooks/useReducedMotion', () => ({
  useReducedMotion: () => mockUseReducedMotion(),
}));

// MuseumDirectoryList stub: exposes onSearchChange + onMuseumPress + onRefresh
// so the wiring contract from MuseumsScreen can be asserted via fireEvent.
jest.mock('@/features/museum/ui/MuseumDirectoryList', () => {
  const ReactMock = require('react');
  const { Pressable, View } = require('react-native');
  return {
    MuseumDirectoryList: (props: {
      onSearchChange: (q: string) => void;
      onMuseumPress: (m: unknown) => void;
      onRefresh: () => void;
      museums: readonly unknown[];
      isLoading: boolean;
      searchQuery: string;
    }) =>
      ReactMock.createElement(
        View,
        { testID: 'museum-directory-list' },
        ReactMock.createElement(Pressable, {
          testID: 'mdl-search-trigger',
          onPress: () => {
            props.onSearchChange('louvre');
          },
        }),
        ReactMock.createElement(Pressable, {
          testID: 'mdl-press-trigger',
          onPress: () => {
            props.onMuseumPress({
              id: 42,
              name: 'Louvre',
              slug: 'louvre',
              address: '99 Rue de Rivoli',
              description: 'Art museum',
              latitude: 48.86,
              longitude: 2.34,
              distanceMeters: 1200,
              source: 'local',
              museumType: 'art',
            });
          },
        }),
        ReactMock.createElement(Pressable, {
          testID: 'mdl-refresh-trigger',
          onPress: () => {
            props.onRefresh();
          },
        }),
      ),
  };
});

// MuseumMapView stub: exposes onMapMoved + onMuseumSelect, captures latest
// `museums` array length to assert prop wiring on view-mode switch.
jest.mock('@/features/museum/ui/MuseumMapView', () => {
  const ReactMock = require('react');
  const { Pressable, View } = require('react-native');
  return {
    MuseumMapView: (props: {
      museums: readonly { id: number }[];
      onMapMoved?: (lat: number, lng: number, bbox: [number, number, number, number]) => void;
      onMuseumSelect?: (m: unknown) => void;
    }) =>
      ReactMock.createElement(
        View,
        {
          testID: 'museum-map-view',
          accessibilityValue: { text: String(props.museums.length) },
        },
        ReactMock.createElement(Pressable, {
          testID: 'mmv-map-moved-trigger',
          onPress: () => props.onMapMoved?.(48.85, 2.35, [2.0, 48.0, 2.5, 49.0]),
        }),
        ReactMock.createElement(Pressable, {
          testID: 'mmv-select-trigger',
          onPress: () =>
            props.onMuseumSelect?.({
              id: 7,
              name: 'Picked',
              slug: 'picked',
              address: '',
              description: '',
              latitude: 48.85,
              longitude: 2.35,
              distanceMeters: 100,
              source: 'local',
              museumType: 'art',
            }),
        }),
        ReactMock.createElement(Pressable, {
          testID: 'mmv-select-osm-trigger',
          onPress: () =>
            props.onMuseumSelect?.({
              id: -1,
              name: 'OSM Place',
              slug: 'osm-1',
              address: null,
              description: null,
              latitude: null,
              longitude: null,
              distanceMeters: null,
              source: 'osm',
              museumType: 'general',
            }),
        }),
      ),
  };
});

// ViewModeToggle stub: exposes onToggle so we can drive list↔map transitions.
jest.mock('@/features/museum/ui/ViewModeToggle', () => {
  const ReactMock = require('react');
  const { Pressable, View } = require('react-native');
  return {
    ViewModeToggle: ({
      mode,
      onToggle,
    }: {
      mode: 'list' | 'map';
      onToggle: (m: 'list' | 'map') => void;
    }) =>
      ReactMock.createElement(
        View,
        { testID: 'view-mode-toggle', accessibilityValue: { text: mode } },
        ReactMock.createElement(Pressable, {
          testID: 'vmt-to-map',
          onPress: () => {
            onToggle('map');
          },
        }),
        ReactMock.createElement(Pressable, {
          testID: 'vmt-to-list',
          onPress: () => {
            onToggle('list');
          },
        }),
      ),
  };
});

// MuseumSheet stub: exposes onStartChat / onOpenInMaps / onViewDetails / onClose
// so each callback wired by MuseumsScreen can be exercised independently.
jest.mock('@/features/museum/ui/MuseumSheet', () => {
  const ReactMock = require('react');
  const { Pressable, View } = require('react-native');
  return {
    MuseumSheet: ({
      museum,
      onClose,
      onStartChat,
      onOpenInMaps,
      onViewDetails,
    }: {
      museum: { id: number; name: string } | null;
      onClose: () => void;
      onStartChat: (m: unknown) => void;
      onOpenInMaps: (m: unknown) => void;
      onViewDetails: (m: unknown) => void;
    }) => {
      if (!museum) return null;
      return ReactMock.createElement(
        View,
        { testID: 'museum-sheet' },
        ReactMock.createElement(Pressable, {
          testID: 'sheet-close',
          onPress: onClose,
        }),
        ReactMock.createElement(Pressable, {
          testID: 'sheet-start-chat',
          onPress: () => {
            onStartChat(museum);
          },
        }),
        ReactMock.createElement(Pressable, {
          testID: 'sheet-open-maps',
          onPress: () => {
            onOpenInMaps(museum);
          },
        }),
        ReactMock.createElement(Pressable, {
          testID: 'sheet-view-details',
          onPress: () => {
            onViewDetails(museum);
          },
        }),
      );
    },
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

import { router } from 'expo-router';

import MuseumsScreen from '@/app/(tabs)/museums';
import { makeMuseumWithDistance } from '../helpers/factories/museum.factories';

describe('MuseumsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseReducedMotion.mockReturnValue(false);
    mockUseLocation.mockReturnValue({
      latitude: 48.8566,
      longitude: 2.3522,
      status: 'granted',
      precision: 'fresh',
      error: null,
    });
    mockUseMuseumDirectory.mockReturnValue({
      museums: [],
      isLoading: false,
      searchQuery: '',
      setSearchQuery: mockSetSearchQuery,
      refresh: mockRefresh,
      searchInBounds: mockSearchInBounds,
    });
  });

  // ── Initial render ──────────────────────────────────────────────────────────

  it('renders the i18n title key in the header card', () => {
    render(<MuseumsScreen />);
    expect(screen.getByText('museumDirectory.title')).toBeTruthy();
  });

  it('starts in list mode and does not render the map surface', () => {
    render(<MuseumsScreen />);
    expect(screen.getByTestId('museum-directory-list')).toBeTruthy();
    expect(screen.queryByTestId('museum-map-view')).toBeNull();
  });

  it('renders the view mode toggle starting on "list"', () => {
    render(<MuseumsScreen />);
    const toggle = screen.getByTestId('view-mode-toggle');
    expect(toggle.props.accessibilityValue).toEqual({ text: 'list' });
  });

  // ── Geo-permission gate ─────────────────────────────────────────────────────

  it('hides the location-denied alert when permission is granted', () => {
    render(<MuseumsScreen />);
    expect(screen.queryByText('museumDirectory.location_denied')).toBeNull();
  });

  it('renders the location-denied alert with role=alert when status is denied', () => {
    mockUseLocation.mockReturnValue({
      latitude: null,
      longitude: null,
      status: 'denied',
      precision: null,
      error: null,
    });
    render(<MuseumsScreen />);
    const denied = screen.getByText('museumDirectory.location_denied');
    expect(denied.props.accessibilityRole).toBe('alert');
    expect(denied.props.accessibilityLiveRegion).toBe('polite');
  });

  // ── List → Map view-mode transition (reduce-motion path) ───────────────────

  it('switches to map view instantly when reduceMotion is enabled', async () => {
    mockUseReducedMotion.mockReturnValue(true);
    render(<MuseumsScreen />);

    fireEvent.press(screen.getByTestId('vmt-to-map'));

    // No animation: the map view appears synchronously after the press.
    await waitFor(() => {
      expect(screen.getByTestId('museum-map-view')).toBeTruthy();
    });
    expect(screen.queryByTestId('museum-directory-list')).toBeNull();
  });

  it('returns to list view and clears mapBbox when toggling back (reduce-motion)', async () => {
    mockUseReducedMotion.mockReturnValue(true);
    render(<MuseumsScreen />);

    fireEvent.press(screen.getByTestId('vmt-to-map'));
    await screen.findByTestId('museum-map-view');

    // Drag the map → bbox set → toggle back to list → bbox cleared.
    fireEvent.press(screen.getByTestId('mmv-map-moved-trigger'));
    fireEvent.press(screen.getByTestId('vmt-to-list'));

    await waitFor(() => {
      expect(screen.getByTestId('museum-directory-list')).toBeTruthy();
    });
    expect(screen.queryByTestId('museum-map-view')).toBeNull();
  });

  it('no-ops when toggling to the current mode (reduce-motion path)', () => {
    mockUseReducedMotion.mockReturnValue(true);
    render(<MuseumsScreen />);

    // Already on list — toggling to list must NOT remount or hide it.
    fireEvent.press(screen.getByTestId('vmt-to-list'));
    expect(screen.getByTestId('museum-directory-list')).toBeTruthy();
    expect(screen.queryByTestId('museum-map-view')).toBeNull();
  });

  // ── List → Map view-mode transition (animated path) ────────────────────────

  it('completes the animated crossfade and lands on map view', async () => {
    mockUseReducedMotion.mockReturnValue(false);
    render(<MuseumsScreen />);

    fireEvent.press(screen.getByTestId('vmt-to-map'));

    // Animated.timing in the JS-only RN test env runs its callback on the next
    // tick; waitFor flushes both fade-out + fade-in callbacks.
    await waitFor(() => {
      expect(screen.getByTestId('museum-map-view')).toBeTruthy();
    });
  });

  // ── Search input wiring (list mode) ─────────────────────────────────────────

  it('forwards search query changes from the list to the directory hook', () => {
    render(<MuseumsScreen />);
    fireEvent.press(screen.getByTestId('mdl-search-trigger'));
    expect(mockSetSearchQuery).toHaveBeenCalledWith('louvre');
  });

  it('forwards refresh requests from the list to the directory hook', () => {
    render(<MuseumsScreen />);
    fireEvent.press(screen.getByTestId('mdl-refresh-trigger'));
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  // ── Sheet selection from list ───────────────────────────────────────────────

  it('opens the museum sheet when a list row is pressed', () => {
    render(<MuseumsScreen />);
    expect(screen.queryByTestId('museum-sheet')).toBeNull();
    fireEvent.press(screen.getByTestId('mdl-press-trigger'));
    expect(screen.getByTestId('museum-sheet')).toBeTruthy();
  });

  it('closes the sheet when MuseumSheet onClose fires', () => {
    render(<MuseumsScreen />);
    fireEvent.press(screen.getByTestId('mdl-press-trigger'));
    expect(screen.getByTestId('museum-sheet')).toBeTruthy();
    fireEvent.press(screen.getByTestId('sheet-close'));
    expect(screen.queryByTestId('museum-sheet')).toBeNull();
  });

  // ── Sheet → start chat ──────────────────────────────────────────────────────

  it('starts a museum-mode conversation with coordinates when sheet onStartChat fires', () => {
    render(<MuseumsScreen />);
    fireEvent.press(screen.getByTestId('mdl-press-trigger'));
    fireEvent.press(screen.getByTestId('sheet-start-chat'));

    expect(mockStartConversation).toHaveBeenCalledTimes(1);
    expect(mockStartConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        museumMode: true,
        museumId: 42,
        museumName: 'Louvre',
        museumAddress: '99 Rue de Rivoli',
        coordinates: { lat: 48.86, lng: 2.34 },
        skipSettings: true,
      }),
    );
    // Sheet closes synchronously before startConversation fires.
    expect(screen.queryByTestId('museum-sheet')).toBeNull();
  });

  it('omits museumId and coordinates for synthetic OSM entries (id <= 0, no coords)', async () => {
    mockUseReducedMotion.mockReturnValue(true);
    render(<MuseumsScreen />);

    // Switch to map mode then select an OSM (id=-1, lat/lng=null) marker.
    fireEvent.press(screen.getByTestId('vmt-to-map'));
    await screen.findByTestId('museum-map-view');
    fireEvent.press(screen.getByTestId('mmv-select-osm-trigger'));

    fireEvent.press(await screen.findByTestId('sheet-start-chat'));

    expect(mockStartConversation).toHaveBeenCalledTimes(1);
    const callArg = mockStartConversation.mock.calls[0][0];
    expect(callArg).toMatchObject({
      museumMode: true,
      museumName: 'OSM Place',
      skipSettings: true,
    });
    // id=-1 → museumId omitted; null lat/lng → coordinates omitted.
    expect(callArg.museumId).toBeUndefined();
    expect(callArg.coordinates).toBeUndefined();
    expect(callArg.museumAddress).toBeUndefined();
  });

  // ── Sheet → open in native maps ─────────────────────────────────────────────

  it('forwards onOpenInMaps to the openInNativeMaps helper with full museum coords', () => {
    render(<MuseumsScreen />);
    fireEvent.press(screen.getByTestId('mdl-press-trigger'));
    fireEvent.press(screen.getByTestId('sheet-open-maps'));

    expect(mockOpenInNativeMaps).toHaveBeenCalledWith({
      latitude: 48.86,
      longitude: 2.34,
      name: 'Louvre',
    });
  });

  // ── Sheet → view details ────────────────────────────────────────────────────

  it('navigates to museum-detail with stringified params on onViewDetails', () => {
    render(<MuseumsScreen />);
    fireEvent.press(screen.getByTestId('mdl-press-trigger'));
    fireEvent.press(screen.getByTestId('sheet-view-details'));

    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/(stack)/museum-detail',
      params: expect.objectContaining({
        id: '42',
        name: 'Louvre',
        slug: 'louvre',
        address: '99 Rue de Rivoli',
        latitude: '48.86',
        longitude: '2.34',
        distanceMeters: '1200',
      }),
    });
    // Sheet closes before navigation.
    expect(screen.queryByTestId('museum-sheet')).toBeNull();
  });

  // ── Map-view interactions ───────────────────────────────────────────────────

  it('shows the "search this area" chip only after the user pans the map', async () => {
    mockUseReducedMotion.mockReturnValue(true);
    render(<MuseumsScreen />);

    fireEvent.press(screen.getByTestId('vmt-to-map'));
    await screen.findByTestId('museum-map-view');

    // No pan yet → chip absent.
    expect(screen.queryByText('museumDirectory.search_this_area')).toBeNull();

    // After onMapMoved fires the chip surfaces with the i18n key as label.
    fireEvent.press(screen.getByTestId('mmv-map-moved-trigger'));
    await waitFor(() => {
      expect(screen.getByText('museumDirectory.search_this_area')).toBeTruthy();
    });
  });

  it('invokes searchInBounds with the latest mapBbox when the chip is pressed', async () => {
    mockUseReducedMotion.mockReturnValue(true);
    render(<MuseumsScreen />);

    fireEvent.press(screen.getByTestId('vmt-to-map'));
    await screen.findByTestId('museum-map-view');
    fireEvent.press(screen.getByTestId('mmv-map-moved-trigger'));

    const chip = await screen.findByText('museumDirectory.search_this_area');
    fireEvent.press(chip);

    expect(mockSearchInBounds).toHaveBeenCalledWith([2.0, 48.0, 2.5, 49.0]);
  });

  it('opens the sheet from a map marker selection', async () => {
    mockUseReducedMotion.mockReturnValue(true);
    render(<MuseumsScreen />);

    fireEvent.press(screen.getByTestId('vmt-to-map'));
    await screen.findByTestId('museum-map-view');

    expect(screen.queryByTestId('museum-sheet')).toBeNull();
    fireEvent.press(screen.getByTestId('mmv-select-trigger'));
    await waitFor(() => {
      expect(screen.getByTestId('museum-sheet')).toBeTruthy();
    });
  });

  // ── Result-count a11y announcement ──────────────────────────────────────────

  it('announces result count changes via AccessibilityInfo when the dataset changes', () => {
    const announceSpy = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => undefined);

    // First render → count=0, no announcement (initial baseline only).
    const { rerender } = render(<MuseumsScreen />);
    expect(announceSpy).not.toHaveBeenCalled();

    // Change dataset → announcement fires with the i18n key.
    mockUseMuseumDirectory.mockReturnValue({
      museums: [makeMuseumWithDistance({ id: 1 }), makeMuseumWithDistance({ id: 2 })],
      isLoading: false,
      searchQuery: '',
      setSearchQuery: mockSetSearchQuery,
      refresh: mockRefresh,
      searchInBounds: mockSearchInBounds,
    });
    act(() => {
      rerender(<MuseumsScreen />);
    });
    expect(announceSpy).toHaveBeenCalledWith('a11y.museum.results_count');
  });

  it('does not announce while loading is in flight', () => {
    const announceSpy = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => undefined);

    mockUseMuseumDirectory.mockReturnValue({
      museums: [],
      isLoading: true,
      searchQuery: '',
      setSearchQuery: mockSetSearchQuery,
      refresh: mockRefresh,
      searchInBounds: mockSearchInBounds,
    });
    render(<MuseumsScreen />);
    expect(announceSpy).not.toHaveBeenCalled();
  });
});
