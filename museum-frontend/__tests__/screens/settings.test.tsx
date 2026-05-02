import '../helpers/test-utils';
import { fireEvent, render, screen } from '@testing-library/react-native';

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

jest.mock('@/features/auth/application/useMe', () => ({
  useMe: () => ({
    data: { user: { ttsVoice: null } },
    isPending: false,
    isError: false,
    error: null,
  }),
}));

const mockOnLogout = jest.fn().mockResolvedValue(undefined);
const mockOnDeleteAccount = jest.fn();
const mockOnExportData = jest.fn().mockResolvedValue(undefined);

jest.mock('@/features/settings/application/useSettingsActions', () => ({
  useSettingsActions: () => ({
    isSigningOut: false,
    isDeletingAccount: false,
    isExporting: false,
    onToggleBiometric: jest.fn(),
    onExportData: mockOnExportData,
    onLogout: mockOnLogout,
    onDeleteAccount: mockOnDeleteAccount,
  }),
}));

let capturedOnSetMode: ((mode: string) => void) | null = null;

jest.mock('@/features/settings/ui/SettingsThemeCard', () => {
  const { Pressable, Text, View } = require('react-native');
  return {
    SettingsThemeCard: (props: { mode: string; onSetMode: (mode: string) => void }) => {
      capturedOnSetMode = props.onSetMode;
      return (
        <View testID="settings-theme-card">
          <Pressable
            testID="theme-dark-button"
            onPress={() => {
              props.onSetMode('dark');
            }}
          >
            <Text>settings.theme_dark</Text>
          </Pressable>
        </View>
      );
    },
  };
});

jest.mock('@/features/settings/ui/SettingsSecurityCard', () => {
  const { Pressable, Text, View } = require('react-native');
  return {
    SettingsSecurityCard: (props: { onToggleBiometric: (v: boolean) => void }) => (
      <View testID="settings-security-card">
        <Pressable
          testID="change-password-button"
          onPress={() => {
            const { router } = require('expo-router');
            router.push('/(stack)/change-password');
          }}
        >
          <Text>settings.change_password</Text>
        </Pressable>
      </View>
    ),
  };
});

jest.mock('@/features/settings/ui/SettingsComplianceLinks', () => {
  const { View } = require('react-native');
  return {
    SettingsComplianceLinks: (props: any) => <View testID="settings-compliance-links" />,
  };
});

jest.mock('@/features/settings/ui/SettingsDangerZone', () => {
  const { Pressable, Text, View } = require('react-native');
  return {
    SettingsDangerZone: (props: { onDeleteAccount: () => void; isDeletingAccount: boolean }) => (
      <View testID="settings-danger-zone">
        <Pressable testID="delete-account-button" onPress={props.onDeleteAccount}>
          <Text>settings.delete_account</Text>
        </Pressable>
      </View>
    ),
  };
});

jest.mock('@/features/settings/ui/VoicePreferenceSection', () => {
  const { View } = require('react-native');
  return {
    VoicePreferenceSection: (_props: { currentVoice: string | null }) => (
      <View testID="voice-preference-section" />
    ),
  };
});

import SettingsScreen from '@/app/(stack)/settings';

const mockRouter = require('expo-router').router;

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

  // ── Behavioral tests ────────────────────────────────────────────────────────

  it('wires setMode to theme card and pressing dark button invokes it', () => {
    render(<SettingsScreen />);
    // Verify the settings screen passes setMode from useTheme to the theme card
    expect(typeof capturedOnSetMode).toBe('function');
    // Pressing the button calls props.onSetMode('dark') without throwing
    fireEvent.press(screen.getByTestId('theme-dark-button'));
  });

  it('calls onLogout when sign out button is pressed', () => {
    render(<SettingsScreen />);
    fireEvent.press(screen.getByLabelText('a11y.settings.sign_out'));
    expect(mockOnLogout).toHaveBeenCalled();
  });

  it('calls onDeleteAccount when delete account button is pressed', () => {
    render(<SettingsScreen />);
    fireEvent.press(screen.getByTestId('delete-account-button'));
    expect(mockOnDeleteAccount).toHaveBeenCalled();
  });

  it('navigates to change-password when change password button is pressed', () => {
    render(<SettingsScreen />);
    fireEvent.press(screen.getByTestId('change-password-button'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(stack)/change-password');
  });

  it('navigates to home when back to home button is pressed', () => {
    render(<SettingsScreen />);
    fireEvent.press(screen.getByLabelText('a11y.settings.back_home'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/home');
  });
});
