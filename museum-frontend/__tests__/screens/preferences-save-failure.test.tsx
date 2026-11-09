import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import i18n from '@/shared/i18n/i18n';
import { useDataModePreferenceStore } from '@/features/settings/dataModeStore';
import { useRuntimeSettingsStore } from '@/features/settings/infrastructure/runtimeSettingsStore';

const mockOpenApiRequest = jest.fn();
jest.mock('@/shared/api/openapiClient', () => ({
  openApiRequest: (...args: unknown[]) => mockOpenApiRequest(...args),
}));

jest.mock('@sentry/react-native', () => ({ captureException: jest.fn() }));

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

import PreferencesScreen from '@/app/(stack)/preferences';

describe('M4 · un enregistrement refusé par le serveur ne se fait pas passer pour réussi', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('fr');
  });

  afterAll(async () => {
    await i18n.changeLanguage('en');
  });

  beforeEach(() => {
    mockOpenApiRequest.mockReset();
    mockOpenApiRequest.mockRejectedValue(new Error('Network Error'));
    useRuntimeSettingsStore.setState({
      defaultMuseumMode: true,
      guideLevel: 'beginner',
      _hydrated: true,
    });
    useDataModePreferenceStore.setState({ preference: 'auto' });
  });

  it('M4 · Enregistrer sans réseau nomme l’échec, garde Expert à l’écran pour réessayer et ne l’annonce pas enregistré', async () => {
    render(<PreferencesScreen />);

    fireEvent.press(screen.getByLabelText('Sélectionner le niveau de guide Expert'));
    fireEvent.press(screen.getByText('Enregistrer les préférences'));

    await waitFor(() => {
      expect(screen.getByText(/Échec de la sauvegarde/)).toBeTruthy();
    });
    expect(screen.queryByText('Préférences enregistrées')).toBeNull();
    expect(
      screen.getByLabelText('Sélectionner le niveau de guide Expert').props.accessibilityState,
    ).toMatchObject({ selected: true });
    expect(useRuntimeSettingsStore.getState().guideLevel).toBe('beginner');
  });

  it('M4 · un mode données refusé par le serveur revient au réglage tenu par le compte', async () => {
    useDataModePreferenceStore.getState().setPreference('low');

    await waitFor(() => {
      expect(useDataModePreferenceStore.getState().preference).toBe('auto');
    });
  });
});
