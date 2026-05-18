/**
 * Tests — `<MuseumPickerScreen>` (W3 R15-R17).
 *
 * Asserts:
 *   - Search box renders with i18n placeholder + a11y label.
 *   - Favourites section is rendered when the storage list resolves > 0.
 *   - Nearby section is rendered with results from `searchMuseums`.
 *   - Tapping a row calls onSelect AND persists to favourites.
 *   - Empty state is visible when nothing is found.
 *   - Close button calls onClose.
 */

import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import '../../helpers/test-utils';

// ── useLocation mock ───────────────────────────────────────────────────────
const mockUseLocation = jest.fn();
jest.mock('@/features/museum/application/useLocation', () => ({
  useLocation: () => mockUseLocation(),
}));

// ── museumApi mocks ────────────────────────────────────────────────────────
const mockSearchMuseums = jest.fn<Promise<unknown>, [unknown]>();
const mockListMuseumDirectory = jest.fn<Promise<unknown>, []>();
jest.mock('@/features/museum/infrastructure/museumApi', () => ({
  museumApi: {
    searchMuseums: (p: unknown) => mockSearchMuseums(p),
    listMuseumDirectory: () => mockListMuseumDirectory(),
  },
}));

// ── favourites infra mocks ─────────────────────────────────────────────────
const mockGetFavourites = jest.fn<Promise<number[]>, []>();
const mockAddFavourite = jest.fn<Promise<void>, [number]>();
jest.mock('@/features/museum/infrastructure/favourites', () => ({
  getFavourites: () => mockGetFavourites(),
  addFavourite: (id: number) => mockAddFavourite(id),
  MUSEUM_FAVOURITES_STORAGE_KEY: 'museum.favourites',
}));

import { MuseumPickerScreen } from '@/features/museum/ui/MuseumPickerScreen';

function grantedLocation() {
  return { latitude: 48.86, longitude: 2.34, status: 'granted', precision: 'fresh', error: null };
}

function makeNearbyEntry(
  overrides: Partial<{ id: number; name: string; address: string; distance: number }> = {},
) {
  return {
    id: overrides.id ?? 7,
    name: overrides.name ?? 'Louvre',
    address: overrides.address ?? '75001 Paris',
    distance: overrides.distance ?? 50,
    latitude: 48.86,
    longitude: 2.33,
    slug: 'louvre',
    description: null,
    source: 'local' as const,
  };
}

function makeDirectoryEntry(id: number, name: string) {
  return {
    id,
    name,
    slug: name.toLowerCase().replace(/\s+/g, '-'),
    address: 'Paris',
    description: null,
    latitude: 48.86,
    longitude: 2.33,
    museumType: 'art' as const,
  };
}

describe('<MuseumPickerScreen>', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLocation.mockReturnValue(grantedLocation());
    mockGetFavourites.mockResolvedValue([]);
    mockListMuseumDirectory.mockResolvedValue([]);
    mockSearchMuseums.mockResolvedValue({ museums: [], count: 0 });
  });

  it('renders the search input with i18n placeholder + a11y label', () => {
    const { getByTestId } = render(<MuseumPickerScreen onSelect={jest.fn()} />);
    const search = getByTestId('museum-picker-search');
    expect(search).toBeTruthy();
    expect(search.props.placeholder).toBe('museumPicker.search_placeholder');
    expect(search.props.accessibilityLabel).toBe('museumPicker.search_placeholder');
  });

  it('renders nearby museums returned by searchMuseums', async () => {
    mockSearchMuseums.mockResolvedValue({
      museums: [makeNearbyEntry({ id: 7, name: 'Louvre' })],
      count: 1,
    });

    const { getByTestId } = render(<MuseumPickerScreen onSelect={jest.fn()} />);
    await waitFor(() => {
      expect(getByTestId('museum-picker-row-7')).toBeTruthy();
    });
  });

  it('renders the favourites section when storage holds entries', async () => {
    mockGetFavourites.mockResolvedValue([42]);
    mockListMuseumDirectory.mockResolvedValue([makeDirectoryEntry(42, "Musée d'Orsay")]);

    const { getByTestId } = render(<MuseumPickerScreen onSelect={jest.fn()} />);
    await waitFor(() => {
      expect(getByTestId('museum-picker-favourites-section')).toBeTruthy();
      expect(getByTestId('museum-picker-favourite-42')).toBeTruthy();
    });
  });

  it('persists pick to favourites AND invokes onSelect when a row is tapped', async () => {
    mockSearchMuseums.mockResolvedValue({
      museums: [makeNearbyEntry({ id: 7, name: 'Louvre' })],
      count: 1,
    });
    const onSelect = jest.fn();

    const { getByTestId } = render(<MuseumPickerScreen onSelect={onSelect} />);
    await waitFor(() => {
      expect(getByTestId('museum-picker-row-7')).toBeTruthy();
    });

    fireEvent.press(getByTestId('museum-picker-row-7'));
    expect(mockAddFavourite).toHaveBeenCalledWith(7);
    expect(onSelect).toHaveBeenCalledWith({ id: 7, name: 'Louvre' });
  });

  it('renders the empty state when no museums + no favourites', async () => {
    mockSearchMuseums.mockResolvedValue({ museums: [], count: 0 });

    const { getByTestId } = render(<MuseumPickerScreen onSelect={jest.fn()} />);
    await waitFor(() => {
      expect(getByTestId('museum-picker-empty')).toBeTruthy();
    });
  });

  it('renders close button when onClose provided + invokes it on press', () => {
    const onClose = jest.fn();
    const { getByTestId } = render(<MuseumPickerScreen onSelect={jest.fn()} onClose={onClose} />);
    fireEvent.press(getByTestId('museum-picker-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('debounces search input and calls searchMuseums after 300 ms idle', async () => {
    jest.useFakeTimers();
    mockSearchMuseums.mockResolvedValue({
      museums: [makeNearbyEntry({ id: 99, name: 'Centre Pompidou' })],
      count: 1,
    });

    const { getByTestId } = render(<MuseumPickerScreen onSelect={jest.fn()} />);

    // Initial nearby call fires synchronously inside an effect.
    await act(async () => {
      await Promise.resolve();
    });
    mockSearchMuseums.mockClear();

    fireEvent.changeText(getByTestId('museum-picker-search'), 'pomp');

    // < 300 ms : no call yet.
    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(mockSearchMuseums).not.toHaveBeenCalled();

    // Once 300 ms elapsed → call is fired.
    await act(async () => {
      jest.advanceTimersByTime(150);
      await Promise.resolve();
    });
    expect(mockSearchMuseums).toHaveBeenCalledWith(expect.objectContaining({ q: 'pomp' }));

    jest.useRealTimers();
  });
});
