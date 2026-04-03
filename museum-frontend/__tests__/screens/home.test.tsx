import '../helpers/test-utils';
import { render, screen } from '@testing-library/react-native';

// ── Screen-specific mocks ────────────────────────────────────────────────────

jest.mock('@/features/chat/infrastructure/chatApi', () => ({
  chatApi: { createSession: jest.fn() },
}));

jest.mock('@/features/settings/runtimeSettings', () => ({
  loadRuntimeSettings: jest.fn().mockResolvedValue({
    defaultLocale: 'en-US',
    defaultMuseumMode: false,
  }),
}));

jest.mock('@/features/settings/application/useRuntimeSettings', () => ({
  useRuntimeSettings: () => ({
    locale: 'en-US',
    museumMode: false,
    guideLevel: 'standard',
  }),
}));

jest.mock('@/features/daily-art/application/useDailyArt', () => ({
  useDailyArt: () => ({
    artwork: null,
    isLoading: false,
    isSaved: false,
    dismissed: false,
    save: jest.fn(),
    skip: jest.fn(),
  }),
}));

jest.mock('@/features/daily-art/ui/DailyArtCard', () => {
  const { View } = require('react-native');
  return {
    DailyArtCard: () => <View testID="daily-art-card" />,
  };
});

import HomeScreen from '@/app/(tabs)/home';

describe('HomeScreen', () => {
  it('renders without crashing', () => {
    render(<HomeScreen />);
    expect(screen.getByText('home.hero_title')).toBeTruthy();
  });

  it('shows hero subtitle', () => {
    render(<HomeScreen />);
    expect(screen.getByText('home.hero_subtitle')).toBeTruthy();
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

  it('renders settings note with locale info', () => {
    render(<HomeScreen />);
    expect(screen.getByText('home.settings_note')).toBeTruthy();
  });
});
