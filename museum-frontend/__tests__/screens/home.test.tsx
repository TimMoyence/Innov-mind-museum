import '../helpers/test-utils';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { useRuntimeSettingsStore } from '@/features/settings/infrastructure/runtimeSettingsStore';

// ── Screen-specific mocks ────────────────────────────────────────────────────

jest.mock('@/features/chat/infrastructure/chatApi', () => ({
  chatApi: { createSession: jest.fn() },
}));

// Access the mock through the mocked module so we have the actual reference
const { chatApi } = jest.requireMock<{ chatApi: { createSession: jest.Mock } }>(
  '@/features/chat/infrastructure/chatApi',
);
const mockCreateSession = chatApi.createSession;

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

jest.mock('@/features/auth/routes', () => ({
  ONBOARDING_ROUTE: '/(stack)/onboarding',
}));

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

  it('renders onboarding and settings buttons', () => {
    render(<HomeScreen />);
    expect(screen.getByLabelText('a11y.home.onboarding')).toBeTruthy();
    expect(screen.getByLabelText('a11y.home.settings')).toBeTruthy();
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

  it('renders floating context menu', () => {
    render(<HomeScreen />);
    expect(screen.getByTestId('floating-context-menu')).toBeTruthy();
  });
});
