import '../helpers/test-utils';
import { render, screen, fireEvent } from '@testing-library/react-native';

import type { MuseumWithDistance } from '@/features/museum/application/useMuseumDirectory';
import { makeMuseumWithDistance as makeMuseum } from '../helpers/factories/museum.factories';

// Mock MuseumCard since it's a separate component
jest.mock('@/features/museum/ui/MuseumCard', () => {
  const { Text, Pressable } = require('react-native');
  return {
    MuseumCard: ({
      museum,
      onPress,
    }: {
      museum: MuseumWithDistance;
      onPress: (m: MuseumWithDistance) => void;
    }) => (
      <Pressable
        onPress={() => {
          onPress(museum);
        }}
        accessibilityLabel={museum.name}
      >
        <Text>{museum.name}</Text>
      </Pressable>
    ),
  };
});

import { MuseumDirectoryList } from '@/features/museum/ui/MuseumDirectoryList';

describe('MuseumDirectoryList', () => {
  const onSearchChange = jest.fn();
  const onMuseumPress = jest.fn();
  const onRefresh = jest.fn();

  const defaultProps = {
    museums: [] as MuseumWithDistance[],
    isLoading: false,
    searchQuery: '',
    onSearchChange,
    onMuseumPress,
    onRefresh,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders skeleton cards when loading', () => {
    render(<MuseumDirectoryList {...defaultProps} isLoading />);
    const skeletons = screen.getAllByTestId('skeleton-card');
    expect(skeletons.length).toBe(5);
  });

  it('renders empty state when museum list is empty', () => {
    render(<MuseumDirectoryList {...defaultProps} />);
    expect(screen.getByText('museumDirectory.no_results')).toBeTruthy();
  });

  it('renders museum list items', () => {
    const museums = [
      makeMuseum({ id: 1, name: 'Louvre Museum' }),
      makeMuseum({ id: 2, name: 'Orsay Museum' }),
    ];
    render(<MuseumDirectoryList {...defaultProps} museums={museums} />);
    expect(screen.getByText('Louvre Museum')).toBeTruthy();
    expect(screen.getByText('Orsay Museum')).toBeTruthy();
  });

  it('renders search bar', () => {
    render(<MuseumDirectoryList {...defaultProps} />);
    expect(screen.getByPlaceholderText('museumDirectory.search_placeholder')).toBeTruthy();
  });

  it('fires onSearchChange when text is entered', () => {
    render(<MuseumDirectoryList {...defaultProps} />);
    fireEvent.changeText(
      screen.getByPlaceholderText('museumDirectory.search_placeholder'),
      'Louvre',
    );
    expect(onSearchChange).toHaveBeenCalledWith('Louvre');
  });

  it('fires onMuseumPress when a museum card is pressed', () => {
    const museum = makeMuseum({ id: 1, name: 'Louvre Museum' });
    render(<MuseumDirectoryList {...defaultProps} museums={[museum]} />);
    fireEvent.press(screen.getByLabelText('Louvre Museum'));
    expect(onMuseumPress).toHaveBeenCalledWith(museum);
  });
});
