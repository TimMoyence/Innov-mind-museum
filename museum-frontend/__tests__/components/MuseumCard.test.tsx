import '../helpers/test-utils';
import { render, screen, fireEvent } from '@testing-library/react-native';

import { MuseumCard } from '@/features/museum/ui/MuseumCard';
import { makeMuseumWithDistance as makeMuseum } from '../helpers/factories/museum.factories';

describe('MuseumCard', () => {
  const onPress = jest.fn();
  const defaults = { name: 'Louvre Museum', address: '75001 Paris, France' };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders museum name', () => {
    render(<MuseumCard museum={makeMuseum(defaults)} onPress={onPress} />);
    expect(screen.getByText('Louvre Museum')).toBeTruthy();
  });

  it('renders museum address', () => {
    render(<MuseumCard museum={makeMuseum(defaults)} onPress={onPress} />);
    expect(screen.getByText('75001 Paris, France')).toBeTruthy();
  });

  it('does not render address when address is null', () => {
    render(<MuseumCard museum={makeMuseum({ ...defaults, address: null })} onPress={onPress} />);
    expect(screen.queryByText('75001 Paris, France')).toBeNull();
  });

  it('fires onPress with museum when card is pressed', () => {
    const museum = makeMuseum(defaults);
    render(<MuseumCard museum={museum} onPress={onPress} />);

    fireEvent.press(screen.getByLabelText('Louvre Museum'));
    expect(onPress).toHaveBeenCalledWith(museum);
  });

  it('renders distance badge in km when distance is ≥ 1000 m', () => {
    render(<MuseumCard museum={makeMuseum({ distanceMeters: 2_500 })} onPress={onPress} />);
    expect(screen.getByText('museumDirectory.distance_km')).toBeTruthy();
  });

  it('renders distance badge in meters when distance is < 1000 m', () => {
    render(<MuseumCard museum={makeMuseum({ distanceMeters: 450 })} onPress={onPress} />);
    expect(screen.getByText('museumDirectory.distance_m')).toBeTruthy();
  });

  it('renders unknown distance text when distance is null', () => {
    render(<MuseumCard museum={makeMuseum({ distanceMeters: null })} onPress={onPress} />);
    expect(screen.getByText('museumDirectory.distance_unknown')).toBeTruthy();
  });
});
