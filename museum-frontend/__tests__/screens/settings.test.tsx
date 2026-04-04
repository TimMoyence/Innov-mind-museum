import '../helpers/test-utils';
import { render, screen } from '@testing-library/react-native';

// ── Screen-specific mocks ────────────────────────────────────────────────────

jest.mock('@/features/settings/application/useRuntimeSettings', () => ({
  useRuntimeSettings: () => ({
    locale: 'en-US',
    museumMode: true,
    guideLevel: 'intermediate',
    isLoading: false,
  }),
}));

jest.mock('@/features/auth/application/useBiometricAuth', () => ({
  useBiometricAuth: () => ({
    isAvailable: true,
    isEnabled: false,
    biometricLabel: 'Face ID',
    enable: jest.fn(),
    disable: jest.fn(),
    isChecking: false,
  }),
}));

jest.mock('@/features/settings/application/useSettingsActions', () => ({
  useSettingsActions: () => ({
    isSigningOut: false,
    isDeletingAccount: false,
    isExporting: false,
    onToggleBiometric: jest.fn(),
    onExportData: jest.fn(),
    onLogout: jest.fn(),
    onDeleteAccount: jest.fn(),
  }),
}));

jest.mock('@/features/settings/ui/SettingsThemeCard', () => {
  const { View } = require('react-native');
  return {
    SettingsThemeCard: (props: any) => <View testID="settings-theme-card" />,
  };
});

jest.mock('@/features/settings/ui/SettingsSecurityCard', () => {
  const { View } = require('react-native');
  return {
    SettingsSecurityCard: (props: any) => <View testID="settings-security-card" />,
  };
});

jest.mock('@/features/settings/ui/SettingsComplianceLinks', () => {
  const { View } = require('react-native');
  return {
    SettingsComplianceLinks: (props: any) => <View testID="settings-compliance-links" />,
  };
});

jest.mock('@/features/settings/ui/SettingsDangerZone', () => {
  const { View } = require('react-native');
  return {
    SettingsDangerZone: (props: any) => <View testID="settings-danger-zone" />,
  };
});

import SettingsScreen from '@/app/(stack)/settings';

describe('SettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders settings title', () => {
    render(<SettingsScreen />);
    expect(screen.getByText('settings.title')).toBeTruthy();
  });

  it('renders subtitle and build notice', () => {
    render(<SettingsScreen />);
    expect(screen.getByText('settings.subtitle')).toBeTruthy();
    expect(screen.getByText('settings.env_note')).toBeTruthy();
  });

  it('renders all settings cards', () => {
    render(<SettingsScreen />);
    expect(screen.getByTestId('settings-theme-card')).toBeTruthy();
    expect(screen.getByTestId('settings-security-card')).toBeTruthy();
    expect(screen.getByTestId('settings-compliance-links')).toBeTruthy();
    expect(screen.getByTestId('settings-danger-zone')).toBeTruthy();
  });

  it('renders current preferences summary', () => {
    render(<SettingsScreen />);
    expect(screen.getByText('settings.current_preferences')).toBeTruthy();
    expect(screen.getByText('settings.locale_label')).toBeTruthy();
    expect(screen.getByText('settings.museum_mode_label')).toBeTruthy();
    expect(screen.getByText('settings.guide_level_label')).toBeTruthy();
  });

  it('renders open preferences button', () => {
    render(<SettingsScreen />);
    expect(screen.getByLabelText('a11y.settings.preferences')).toBeTruthy();
  });

  it('renders guided experience card', () => {
    render(<SettingsScreen />);
    expect(screen.getByText('settings.guided_experience_title')).toBeTruthy();
    expect(screen.getByText('settings.guided_experience_subtitle')).toBeTruthy();
  });

  it('renders sign out button', () => {
    render(<SettingsScreen />);
    expect(screen.getByLabelText('a11y.settings.sign_out')).toBeTruthy();
    expect(screen.getByText('settings.sign_out')).toBeTruthy();
  });

  it('renders back to home button', () => {
    render(<SettingsScreen />);
    expect(screen.getByLabelText('a11y.settings.back_home')).toBeTruthy();
    expect(screen.getByText('settings.back_to_home')).toBeTruthy();
  });

  it('renders floating context menu', () => {
    render(<SettingsScreen />);
    expect(screen.getByTestId('floating-context-menu')).toBeTruthy();
  });
});
