import '../helpers/test-utils';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { useRuntimeSettingsStore } from '@/features/settings/infrastructure/runtimeSettingsStore';

// ── Screen-specific mocks ────────────────────────────────────────────────────

const mockSaveDefaultMuseumMode = jest.fn();
const mockSaveGuideLevel = jest.fn();
jest.mock('@/features/settings/runtimeSettings', () => ({
  saveDefaultMuseumMode: (...args: any[]) => mockSaveDefaultMuseumMode(...args),
  saveGuideLevel: (...args: any[]) => mockSaveGuideLevel(...args),
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
      defaultLocale: 'en-US',
      defaultMuseumMode: true,
      guideLevel: 'beginner',
      _hydrated: true,
    });
    mockSaveDefaultMuseumMode.mockResolvedValue(undefined);
    mockSaveGuideLevel.mockResolvedValue(undefined);
  });

  it('reads settings from the Zustand store on mount', () => {
    render(<PreferencesScreen />);
    // The screen reads from the store, so guide level buttons should already be visible
    expect(screen.getByText('beginner')).toBeTruthy();
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
    expect(screen.getByText('beginner')).toBeTruthy();
    expect(screen.getByText('intermediate')).toBeTruthy();
    expect(screen.getByText('expert')).toBeTruthy();
  });

  it('renders museum mode switch after loading', () => {
    render(<PreferencesScreen />);
    expect(screen.getByText('preferences.museum_mode_label')).toBeTruthy();
  });

  it('renders save button', () => {
    render(<PreferencesScreen />);
    expect(screen.getByLabelText('a11y.preferences.save')).toBeTruthy();
  });

  it('calls save functions when save button is pressed', async () => {
    render(<PreferencesScreen />);
    fireEvent.press(screen.getByLabelText('a11y.preferences.save'));
    await waitFor(() => {
      expect(mockSaveDefaultMuseumMode).toHaveBeenCalled();
      expect(mockSaveGuideLevel).toHaveBeenCalled();
    });
  });

  it('renders learn guided button', () => {
    render(<PreferencesScreen />);
    expect(screen.getByLabelText('a11y.preferences.learn_guided')).toBeTruthy();
  });
});
