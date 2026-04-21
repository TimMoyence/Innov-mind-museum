import '../helpers/test-utils';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { useRuntimeSettingsStore } from '@/features/settings/infrastructure/runtimeSettingsStore';

// ── Screen-specific mocks ────────────────────────────────────────────────────

jest.mock('@/features/chat/infrastructure/chatApi', () => ({
  chatApi: { createSession: jest.fn() },
}));

const mockCreateSession = jest.requireMock<{ chatApi: { createSession: jest.Mock } }>(
  '@/features/chat/infrastructure/chatApi',
).chatApi.createSession;

const { router } = jest.requireMock<{ router: { push: jest.Mock; back: jest.Mock } }>(
  'expo-router',
);

jest.mock('@/features/settings/application/useRuntimeSettings', () => ({
  useRuntimeSettings: () => ({
    locale: 'en-US',
    museumMode: false,
    guideLevel: 'standard',
  }),
}));

const mockUseDailyArt = jest.fn();
jest.mock('@/features/daily-art/application/useDailyArt', () => ({
  useDailyArt: () => mockUseDailyArt(),
}));

jest.mock('@/features/daily-art/ui/DailyArtCard', () => {
  const { View } = require('react-native');
  return {
    DailyArtCard: (props: any) => <View testID="daily-art-card" {...props} />,
  };
});

import HomeScreen from '@/app/(tabs)/home';

describe('HomeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useRuntimeSettingsStore.setState({
      defaultLocale: 'en-US',
      defaultMuseumMode: false,
      guideLevel: 'beginner',
      _hydrated: true,
    });
    mockUseDailyArt.mockReturnValue({
      artwork: null,
      isLoading: false,
      isSaved: false,
      dismissed: false,
      save: jest.fn(),
      skip: jest.fn(),
    });
  });

  it('renders start conversation button', () => {
    render(<HomeScreen />);
    expect(screen.getByLabelText('a11y.home.start_conversation')).toBeTruthy();
  });

  it('renders the hero settings gear button', () => {
    render(<HomeScreen />);
    expect(screen.getByTestId('hero-settings-button')).toBeTruthy();
  });

  it('renders the three home intent chips', () => {
    render(<HomeScreen />);
    expect(screen.getByTestId('home-intent-chips')).toBeTruthy();
    expect(screen.getByTestId('home-intent-chip-vocal')).toBeTruthy();
    expect(screen.getByTestId('home-intent-chip-camera')).toBeTruthy();
    expect(screen.getByTestId('home-intent-chip-walk')).toBeTruthy();
  });

  it('renders DailyArtCard when artwork is available and not dismissed', () => {
    mockUseDailyArt.mockReturnValue({
      artwork: { id: '1', title: 'Mona Lisa', imageUrl: 'https://example.com/mona.jpg' },
      isLoading: false,
      isSaved: false,
      dismissed: false,
      save: jest.fn(),
      skip: jest.fn(),
    });
    render(<HomeScreen />);
    expect(screen.getByTestId('daily-art-card')).toBeTruthy();
  });

  it('does not render DailyArtCard when artwork is dismissed', () => {
    mockUseDailyArt.mockReturnValue({
      artwork: { id: '1', title: 'Mona Lisa', imageUrl: 'https://example.com/mona.jpg' },
      isLoading: false,
      isSaved: false,
      dismissed: true,
      save: jest.fn(),
      skip: jest.fn(),
    });
    render(<HomeScreen />);
    expect(screen.queryByTestId('daily-art-card')).toBeNull();
  });

  it('does not render DailyArtCard when still loading', () => {
    mockUseDailyArt.mockReturnValue({
      artwork: { id: '1', title: 'Mona Lisa', imageUrl: 'https://example.com/mona.jpg' },
      isLoading: true,
      isSaved: false,
      dismissed: false,
      save: jest.fn(),
      skip: jest.fn(),
    });
    render(<HomeScreen />);
    expect(screen.queryByTestId('daily-art-card')).toBeNull();
  });

  it('starts conversation flow on primary button press', async () => {
    mockCreateSession.mockResolvedValue({ session: { id: 'sess-123' } });
    render(<HomeScreen />);
    fireEvent.press(screen.getByLabelText('a11y.home.start_conversation'));
    await waitFor(() => {
      expect(mockCreateSession).toHaveBeenCalledWith({
        locale: 'en-US',
        museumMode: false,
      });
    });
  });

  it('shows error notice when session creation fails', async () => {
    mockCreateSession.mockRejectedValue(new Error('Network error'));
    render(<HomeScreen />);
    fireEvent.press(screen.getByLabelText('a11y.home.start_conversation'));
    await waitFor(() => {
      expect(screen.getByTestId('error-notice')).toBeTruthy();
    });
  });

  it('opens settings when the hero gear button is pressed', () => {
    render(<HomeScreen />);
    fireEvent.press(screen.getByTestId('hero-settings-button'));
    expect(router.push).toHaveBeenCalledWith('/(stack)/settings');
  });

  it('creates an audio session when the vocal chip is pressed', async () => {
    mockCreateSession.mockResolvedValue({ session: { id: 'sess-audio' } });
    render(<HomeScreen />);
    fireEvent.press(screen.getByTestId('home-intent-chip-vocal'));
    await waitFor(() => {
      expect(mockCreateSession).toHaveBeenCalledTimes(1);
    });
    expect(router.push).toHaveBeenCalledWith('/(stack)/chat/sess-audio?intent=audio');
  });

  it('creates a camera session when the camera chip is pressed', async () => {
    mockCreateSession.mockResolvedValue({ session: { id: 'sess-cam' } });
    render(<HomeScreen />);
    fireEvent.press(screen.getByTestId('home-intent-chip-camera'));
    await waitFor(() => {
      expect(mockCreateSession).toHaveBeenCalledTimes(1);
    });
    expect(router.push).toHaveBeenCalledWith('/(stack)/chat/sess-cam?intent=camera');
  });

  it('navigates to walk composer without creating a session when walk chip is pressed', () => {
    render(<HomeScreen />);
    fireEvent.press(screen.getByTestId('home-intent-chip-walk'));
    expect(mockCreateSession).not.toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith('/(stack)/walk-composer');
  });
});
