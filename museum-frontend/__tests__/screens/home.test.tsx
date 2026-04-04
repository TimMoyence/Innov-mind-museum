import '../helpers/test-utils';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

// ── Screen-specific mocks ────────────────────────────────────────────────────

const mockCreateSession = jest.fn();
jest.mock('@/features/chat/infrastructure/chatApi', () => ({
  chatApi: { createSession: mockCreateSession },
}));

const mockLoadRuntimeSettings = jest.fn().mockResolvedValue({
  defaultLocale: 'en-US',
  defaultMuseumMode: false,
});
jest.mock('@/features/settings/runtimeSettings', () => ({
  loadRuntimeSettings: (...args: any[]) => mockLoadRuntimeSettings(...args),
}));

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
    mockLoadRuntimeSettings.mockResolvedValue({
      defaultLocale: 'en-US',
      defaultMuseumMode: false,
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
      expect(mockLoadRuntimeSettings).toHaveBeenCalledTimes(1);
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
