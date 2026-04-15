import '../helpers/test-utils';
import { render, screen } from '@testing-library/react-native';

// Patch useLocalSearchParams to return museum data
const expoRouter = require('expo-router');
expoRouter.useLocalSearchParams = () => ({
  id: '1',
  name: 'Louvre Museum',
  slug: 'louvre',
  address: '75001 Paris, France',
  description: 'The world-famous art museum.',
  latitude: '48.8606',
  longitude: '2.3376',
  distanceMeters: '1200',
});

const mockCreateSession = jest.fn();
jest.mock('@/features/chat/infrastructure/chatApi', () => ({
  chatApi: {
    createSession: (...args: unknown[]) => mockCreateSession(...args),
  },
}));

import MuseumDetailScreen from '@/app/(stack)/museum-detail';

describe('MuseumDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(<MuseumDetailScreen />);
    expect(screen.getByText('Louvre Museum')).toBeTruthy();
  });

  it('renders the museum name', () => {
    render(<MuseumDetailScreen />);
    expect(screen.getByText('Louvre Museum')).toBeTruthy();
  });

  it('renders the museum address', () => {
    render(<MuseumDetailScreen />);
    expect(screen.getByText('75001 Paris, France')).toBeTruthy();
  });

  it('renders the distance badge in km when ≥ 1 km', () => {
    render(<MuseumDetailScreen />);
    expect(screen.getByText('museumDirectory.distance_km')).toBeTruthy();
  });

  it('renders the description section', () => {
    render(<MuseumDetailScreen />);
    expect(screen.getByText('The world-famous art museum.')).toBeTruthy();
  });

  it('renders the start chat button', () => {
    render(<MuseumDetailScreen />);
    expect(screen.getByLabelText('museumDirectory.start_chat')).toBeTruthy();
  });

  it('renders the open in maps button', () => {
    render(<MuseumDetailScreen />);
    expect(screen.getByLabelText('museumDirectory.open_in_maps')).toBeTruthy();
  });

  it('renders the back button', () => {
    render(<MuseumDetailScreen />);
    expect(screen.getByLabelText('common.back')).toBeTruthy();
  });
});
