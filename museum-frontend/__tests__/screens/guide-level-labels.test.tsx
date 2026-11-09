import { render, screen } from '@testing-library/react-native';

import i18n from '@/shared/i18n/i18n';
import { useRuntimeSettingsStore } from '@/features/settings/infrastructure/runtimeSettingsStore';
import { CurrentPreferencesCard } from '@/features/settings/ui/CurrentPreferencesCard';

jest.mock('@/shared/ui/ThemeContext', () => ({
  useTheme: () => ({
    theme: new Proxy({}, { get: () => '#000000' }),
    isDark: false,
  }),
}));

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  NotificationFeedbackType: { Success: 'success' },
}));

jest.mock('@/shared/ui/GlassCard', () => {
  const { View } = require('react-native');
  return { GlassCard: View };
});

jest.mock('@/shared/ui/LiquidScreen', () => {
  const { View } = require('react-native');
  return { LiquidScreen: View };
});

jest.mock('@/shared/ui/liquidTheme', () => ({ pickMuseumBackground: () => 0 }));

jest.mock('@/shared/ui/FloatingContextMenu', () => ({ FloatingContextMenu: () => null }));

jest.mock('@/features/settings/ui/ContentPreferencesCard', () => ({
  ContentPreferencesCard: () => null,
}));

jest.mock('@/shared/i18n/I18nContext', () => ({
  useI18n: () => ({ language: 'fr', setLanguage: jest.fn() }),
}));

jest.mock('@/features/settings/infrastructure/userProfileApi', () => ({
  saveProfilePreferences: jest.fn(),
}));

import PreferencesScreen from '@/app/(stack)/preferences';

describe('M5 · les niveaux s’affichent traduits', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('fr');
  });

  afterAll(async () => {
    await i18n.changeLanguage('en');
  });

  beforeEach(() => {
    useRuntimeSettingsStore.setState({
      defaultMuseumMode: true,
      guideLevel: 'beginner',
      _hydrated: true,
    });
  });

  it('M5 · Préférences propose Débutant, Intermédiaire et Expert', () => {
    render(<PreferencesScreen />);

    expect(screen.getByText('Débutant')).toBeTruthy();
    expect(screen.getByText('Intermédiaire')).toBeTruthy();
    expect(screen.getByText('Expert')).toBeTruthy();
    expect(screen.queryByText('beginner')).toBeNull();
  });

  it('M5 · Réglages affiche le niveau et la langue en toutes lettres', () => {
    render(
      <CurrentPreferencesCard
        locale="fr"
        museumMode
        guideLevel="beginner"
        isLoading={false}
        onOpenPreferences={jest.fn()}
      />,
    );

    expect(screen.getByText('Niveau du guide : Débutant')).toBeTruthy();
    expect(screen.getByText('Langue : Français')).toBeTruthy();
  });
});
