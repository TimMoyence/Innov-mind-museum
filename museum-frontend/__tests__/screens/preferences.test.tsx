import '../helpers/test-utils';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { useRuntimeSettingsStore } from '@/features/settings/infrastructure/runtimeSettingsStore';

const mockSaveProfilePreferences = jest.fn().mockResolvedValue(null);
jest.mock('@/features/settings/infrastructure/userProfileApi', () => ({
  saveProfilePreferences: (...args: unknown[]) => mockSaveProfilePreferences(...args),
}));

jest.mock('@/shared/config/supportedLocales', () => ({
  LANGUAGE_OPTIONS: [
    { code: 'en', label: 'English', nativeLabel: 'English' },
    { code: 'fr', label: 'French', nativeLabel: 'Fran\u00e7ais' },
  ],
  SUPPORTED_LOCALES: ['en', 'fr'],
}));

const mockSetLanguage = jest.fn();
jest.mock('@/shared/i18n/I18nContext', () => ({
  useI18n: () => ({
    language: 'en',
    setLanguage: mockSetLanguage,
  }),
}));

import PreferencesScreen from '@/app/(stack)/preferences';

describe('PreferencesScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useRuntimeSettingsStore.setState({
      defaultMuseumMode: true,
      guideLevel: 'beginner',
      _hydrated: true,
    });
  });

  it('reads settings from the Zustand store on mount', () => {
    render(<PreferencesScreen />);
    expect(screen.getByText('guideLevel.beginner')).toBeTruthy();
    expect(screen.getByText('preferences.museum_mode_label')).toBeTruthy();
  });

  it('shows loading indicator when store is not hydrated', () => {
    useRuntimeSettingsStore.setState({ _hydrated: false });
    render(<PreferencesScreen />);
    expect(screen.getByText('preferences.loading')).toBeTruthy();
  });

  it('renders title and subtitle', () => {
    render(<PreferencesScreen />);
    expect(screen.getByText('preferences.title')).toBeTruthy();
    expect(screen.getByText('preferences.subtitle')).toBeTruthy();
  });

  it('renders language options after loading', () => {
    render(<PreferencesScreen />);
    expect(screen.getByText('English')).toBeTruthy();
    expect(screen.getByText('Fran\u00e7ais')).toBeTruthy();
  });

  it('renders guide level buttons after loading', () => {
    render(<PreferencesScreen />);
    expect(screen.getByText('guideLevel.beginner')).toBeTruthy();
    expect(screen.getByText('guideLevel.intermediate')).toBeTruthy();
    expect(screen.getByText('guideLevel.expert')).toBeTruthy();
  });

  it('renders museum mode switch after loading', () => {
    render(<PreferencesScreen />);
    expect(screen.getByText('preferences.museum_mode_label')).toBeTruthy();
  });

  it('renders save button', () => {
    render(<PreferencesScreen />);
    expect(screen.getByLabelText('a11y.preferences.save')).toBeTruthy();
  });

  it('writes the chosen level and museum mode on the account when save is pressed', async () => {
    render(<PreferencesScreen />);
    fireEvent.press(screen.getByLabelText('a11y.preferences.save'));
    await waitFor(() => {
      expect(mockSaveProfilePreferences).toHaveBeenCalledWith({ defaultMuseumMode: true });
      expect(mockSaveProfilePreferences).toHaveBeenCalledWith({ guideLevel: 'beginner' });
    });
  });

  it('renders learn guided button', () => {
    render(<PreferencesScreen />);
    expect(screen.getByLabelText('a11y.preferences.learn_guided')).toBeTruthy();
  });
});
