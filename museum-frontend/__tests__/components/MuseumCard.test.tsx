import '../helpers/test-utils';
import { render, screen, fireEvent } from '@testing-library/react-native';

import type { MuseumWithDistance } from '@/features/museum/application/useMuseumDirectory';
import { MuseumCard } from '@/features/museum/ui/MuseumCard';

const makeMuseum = (overrides?: Partial<MuseumWithDistance>): MuseumWithDistance => ({
  id: 1,
  name: 'Louvre Museum',
  slug: 'louvre-museum',
  address: '75001 Paris, France',
  description: 'Famous museum',
  latitude: 48.8606,
  longitude: 2.3376,
  distance: 1.2,
  ...overrides,
});

describe('MuseumCard', () => {
  const onPress = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders museum name', () => {
    render(<MuseumCard museum={makeMuseum()} onPress={onPress} />);
    expect(screen.getByText('Louvre Museum')).toBeTruthy();
  });

  it('renders museum address', () => {
    render(<MuseumCard museum={makeMuseum()} onPress={onPress} />);
    expect(screen.getByText('75001 Paris, France')).toBeTruthy();
  });

  it('does not render address when address is null', () => {
    render(<MuseumCard museum={makeMuseum({ address: null })} onPress={onPress} />);
    expect(screen.queryByText('75001 Paris, France')).toBeNull();
  });

  it('fires onPress with museum when card is pressed', () => {
    const museum = makeMuseum();
    render(<MuseumCard museum={museum} onPress={onPress} />);

    fireEvent.press(screen.getByLabelText('Louvre Museum'));
    expect(onPress).toHaveBeenCalledWith(museum);
  });

  it('renders distance badge when distance is not null', () => {
    render(<MuseumCard museum={makeMuseum({ distance: 2.5 })} onPress={onPress} />);
    expect(screen.getByText('museumDirectory.distance_km')).toBeTruthy();
  });

  it('renders unknown distance text when distance is null', () => {
    render(<MuseumCard museum={makeMuseum({ distance: null })} onPress={onPress} />);
    expect(screen.getByText('museumDirectory.distance_unknown')).toBeTruthy();
  });
});
