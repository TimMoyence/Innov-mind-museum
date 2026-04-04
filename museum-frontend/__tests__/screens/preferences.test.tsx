import '../helpers/test-utils';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

// ── Screen-specific mocks ────────────────────────────────────────────────────

const mockLoadRuntimeSettings = jest.fn();
const mockSaveDefaultMuseumMode = jest.fn();
const mockSaveGuideLevel = jest.fn();
jest.mock('@/features/settings/runtimeSettings', () => ({
  loadRuntimeSettings: (...args: any[]) => mockLoadRuntimeSettings(...args),
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
    mockLoadRuntimeSettings.mockResolvedValue({
      defaultMuseumMode: true,
      guideLevel: 'beginner',
    });
    mockSaveDefaultMuseumMode.mockResolvedValue(undefined);
    mockSaveGuideLevel.mockResolvedValue(undefined);
  });

  it('loads settings on mount', async () => {
    render(<PreferencesScreen />);
    await waitFor(() => {
      expect(mockLoadRuntimeSettings).toHaveBeenCalledTimes(1);
    });
  });

  it('shows loading indicator before settings load', () => {
    mockLoadRuntimeSettings.mockReturnValue(new Promise(() => {})); // never resolves
    render(<PreferencesScreen />);
    expect(screen.getByText('preferences.loading')).toBeTruthy();
  });

  it('renders title and subtitle', async () => {
    render(<PreferencesScreen />);
    await waitFor(() => {
      expect(screen.getByText('preferences.title')).toBeTruthy();
    });
    expect(screen.getByText('preferences.subtitle')).toBeTruthy();
  });

  it('renders language options after loading', async () => {
    render(<PreferencesScreen />);
    await waitFor(() => {
      expect(screen.getByText('English')).toBeTruthy();
    });
    expect(screen.getByText('Fran\u00e7ais')).toBeTruthy();
  });

  it('renders guide level buttons after loading', async () => {
    render(<PreferencesScreen />);
    await waitFor(() => {
      expect(screen.getByText('beginner')).toBeTruthy();
    });
    expect(screen.getByText('intermediate')).toBeTruthy();
    expect(screen.getByText('expert')).toBeTruthy();
  });

  it('renders museum mode switch after loading', async () => {
    render(<PreferencesScreen />);
    await waitFor(() => {
      expect(screen.getByText('preferences.museum_mode_label')).toBeTruthy();
    });
  });

  it('renders save button', async () => {
    render(<PreferencesScreen />);
    await waitFor(() => {
      expect(screen.getByLabelText('a11y.preferences.save')).toBeTruthy();
    });
  });

  it('calls save functions when save button is pressed', async () => {
    render(<PreferencesScreen />);
    await waitFor(() => {
      expect(screen.getByLabelText('a11y.preferences.save')).toBeTruthy();
    });
    fireEvent.press(screen.getByLabelText('a11y.preferences.save'));
    await waitFor(() => {
      expect(mockSaveDefaultMuseumMode).toHaveBeenCalled();
      expect(mockSaveGuideLevel).toHaveBeenCalled();
    });
  });

  it('renders learn guided button', async () => {
    render(<PreferencesScreen />);
    await waitFor(() => {
      expect(screen.getByLabelText('a11y.preferences.learn_guided')).toBeTruthy();
    });
  });
});
