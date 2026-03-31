/**
 * Accessibility audit tests for museum-frontend.
 *
 * Verifies that interactive components expose proper accessibilityRole,
 * accessibilityLabel, and accessibilityHint props for screen readers.
 *
 * Since React Native does not use a DOM, we rely on rendered tree inspection
 * rather than axe-core.
 */
import '../helpers/test-utils';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';

// ── AuthScreen mocks ────────────────────────────────────────────────────────

jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ setIsAuthenticated: jest.fn() }),
}));

jest.mock('@/features/auth/infrastructure/authApi', () => ({
  authService: {
    login: jest.fn(),
    register: jest.fn(),
    forgotPassword: jest.fn(),
  },
}));

jest.mock('@/features/auth/infrastructure/authTokenStore', () => ({
  authStorage: { setRefreshToken: jest.fn() },
  setAccessToken: jest.fn(),
}));

jest.mock('@/features/auth/application/useSocialLogin', () => ({
  useSocialLogin: () => ({
    handleAppleSignIn: jest.fn(),
    handleGoogleSignIn: jest.fn(),
    isSocialLoading: false,
    appleAuthAvailable: false,
  }),
}));

jest.mock('@/features/auth/routes', () => ({
  HOME_ROUTE: '/(tabs)/home',
}));

jest.mock('expo-apple-authentication', () => {
  const { View } = require('react-native');
  return {
    AppleAuthenticationButton: View,
    AppleAuthenticationButtonType: { SIGN_IN: 0 },
    AppleAuthenticationButtonStyle: { BLACK: 0 },
  };
});

// ── SettingsScreen mocks ────────────────────────────────────────────────────

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

jest.mock('@/features/settings/application/useRuntimeSettings', () => ({
  useRuntimeSettings: () => ({
    locale: 'en',
    museumMode: false,
    guideLevel: 'standard',
    isLoading: false,
  }),
}));

jest.mock('@/features/auth/infrastructure/authTokenStore', () => ({
  authStorage: { setRefreshToken: jest.fn(), clearRefreshToken: jest.fn() },
  setAccessToken: jest.fn(),
  clearAccessToken: jest.fn(),
}));

// ── Lazy imports (after mocks) ──────────────────────────────────────────────

import AuthScreen from '@/app/auth';
import SettingsScreen from '@/app/(stack)/settings';
import { ChatInput } from '@/features/chat/ui/ChatInput';
import { WelcomeCard } from '@/features/chat/ui/WelcomeCard';

// ============================================================================
// AuthScreen accessibility
// ============================================================================

describe('AuthScreen a11y', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('email input has accessibilityLabel', () => {
    render(<AuthScreen />);
    const emailInput = screen.getByLabelText('a11y.auth.email_input');
    expect(emailInput).toBeTruthy();
  });

  it('password input has accessibilityLabel', () => {
    render(<AuthScreen />);
    const passwordInput = screen.getByLabelText('a11y.auth.password_input');
    expect(passwordInput).toBeTruthy();
  });

  it('login submit button has accessibilityRole=button and accessibilityLabel', () => {
    render(<AuthScreen />);
    const submitButton = screen.getByLabelText('a11y.auth.login_button');
    expect(submitButton).toBeTruthy();
    expect(submitButton.props.accessibilityRole).toBe('button');
  });

  it('toggle-to-register button has accessibilityRole=button', () => {
    render(<AuthScreen />);
    const toggleButton = screen.getByLabelText('a11y.auth.toggle_register');
    expect(toggleButton).toBeTruthy();
    expect(toggleButton.props.accessibilityRole).toBe('button');
  });

  it('register mode: firstname and lastname inputs have accessibilityLabel', () => {
    render(<AuthScreen />);
    fireEvent.press(screen.getByLabelText('a11y.auth.toggle_register'));

    expect(screen.getByLabelText('a11y.auth.firstname_input')).toBeTruthy();
    expect(screen.getByLabelText('a11y.auth.lastname_input')).toBeTruthy();
  });

  it('register mode: submit button has register label', () => {
    render(<AuthScreen />);
    fireEvent.press(screen.getByLabelText('a11y.auth.toggle_register'));

    const registerButton = screen.getByLabelText('a11y.auth.register_button');
    expect(registerButton).toBeTruthy();
    expect(registerButton.props.accessibilityRole).toBe('button');
  });

  it('register mode: GDPR checkbox has accessibilityRole=checkbox', () => {
    render(<AuthScreen />);
    fireEvent.press(screen.getByLabelText('a11y.auth.toggle_register'));

    const gdprCheckbox = screen.getByLabelText('a11y.auth.gdpr_checkbox');
    expect(gdprCheckbox.props.accessibilityRole).toBe('checkbox');
  });

  it('Google sign-in button has accessibilityRole=button and label', () => {
    render(<AuthScreen />);
    const googleButton = screen.getByLabelText('a11y.auth.google_signin');
    expect(googleButton).toBeTruthy();
    expect(googleButton.props.accessibilityRole).toBe('button');
  });
});

// ============================================================================
// SettingsScreen accessibility
// ============================================================================

describe('SettingsScreen a11y', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('all theme buttons have accessibilityRole=button', () => {
    render(<SettingsScreen />);
    // There are 3 theme buttons (system/light/dark), each with this a11y pattern
    const themeButtons = screen.getAllByLabelText('a11y.settings.theme_button');
    expect(themeButtons.length).toBe(3);
    for (const btn of themeButtons) {
      expect(btn.props.accessibilityRole).toBe('button');
    }
  });

  it('change password button has accessibilityRole=button', () => {
    render(<SettingsScreen />);
    const changePwBtn = screen.getByLabelText('a11y.settings.change_password');
    expect(changePwBtn).toBeTruthy();
    expect(changePwBtn.props.accessibilityRole).toBe('button');
  });

  it('delete account button has accessibilityRole=button with hint', () => {
    render(<SettingsScreen />);
    const deleteBtn = screen.getByLabelText('a11y.settings.delete_account');
    expect(deleteBtn).toBeTruthy();
    expect(deleteBtn.props.accessibilityRole).toBe('button');
    expect(deleteBtn.props.accessibilityHint).toBe('a11y.settings.delete_account_hint');
  });

  it('sign out button has accessibilityRole=button with hint', () => {
    render(<SettingsScreen />);
    const signOutBtn = screen.getByLabelText('a11y.settings.sign_out');
    expect(signOutBtn).toBeTruthy();
    expect(signOutBtn.props.accessibilityRole).toBe('button');
    expect(signOutBtn.props.accessibilityHint).toBe('a11y.settings.sign_out_hint');
  });

  it('compliance links have accessibilityRole=link', () => {
    render(<SettingsScreen />);
    const privacyLink = screen.getByLabelText('a11y.settings.privacy_link');
    const termsLink = screen.getByLabelText('a11y.settings.terms_link');
    const supportLink = screen.getByLabelText('a11y.settings.support_link');

    expect(privacyLink.props.accessibilityRole).toBe('link');
    expect(termsLink.props.accessibilityRole).toBe('link');
    expect(supportLink.props.accessibilityRole).toBe('link');
  });
});

// ============================================================================
// ChatInput accessibility
// ============================================================================

describe('ChatInput a11y', () => {
  const defaultProps = {
    value: '',
    onChangeText: jest.fn(),
    onSend: jest.fn(),
    isSending: false,
  };

  it('text input has accessibilityLabel', () => {
    render(<ChatInput {...defaultProps} />);
    const input = screen.getByLabelText('a11y.chat.message_input');
    expect(input).toBeTruthy();
  });

  it('send button has accessibilityRole=button and accessibilityLabel', () => {
    render(<ChatInput {...defaultProps} />);
    const sendBtn = screen.getByLabelText('a11y.chat.send');
    expect(sendBtn).toBeTruthy();
    expect(sendBtn.props.accessibilityRole).toBe('button');
  });

  it('send button has accessibilityHint', () => {
    render(<ChatInput {...defaultProps} />);
    const sendBtn = screen.getByLabelText('a11y.chat.send');
    expect(sendBtn.props.accessibilityHint).toBe('a11y.chat.send_hint');
  });
});

// ============================================================================
// WelcomeCard accessibility
// ============================================================================

describe('WelcomeCard a11y', () => {
  const defaultProps = {
    museumMode: false,
    onSuggestion: jest.fn(),
    onCamera: jest.fn(),
    disabled: false,
  };

  it('all suggestion buttons have accessibilityRole=button', () => {
    render(<WelcomeCard {...defaultProps} />);

    const cameraBtn = screen.getByLabelText('welcome.suggestions.standard_camera');
    const styleBtn = screen.getByLabelText('welcome.suggestions.standard_style');
    const questionBtn = screen.getByLabelText('welcome.suggestions.standard_question');

    expect(cameraBtn.props.accessibilityRole).toBe('button');
    expect(styleBtn.props.accessibilityRole).toBe('button');
    expect(questionBtn.props.accessibilityRole).toBe('button');
  });

  it('camera suggestion has a camera-specific hint', () => {
    render(<WelcomeCard {...defaultProps} />);
    const cameraBtn = screen.getByLabelText('welcome.suggestions.standard_camera');
    expect(cameraBtn.props.accessibilityHint).toBe('a11y.chat.camera_suggestion_hint');
  });

  it('text suggestions have a text-specific hint', () => {
    render(<WelcomeCard {...defaultProps} />);
    const styleBtn = screen.getByLabelText('welcome.suggestions.standard_style');
    expect(styleBtn.props.accessibilityHint).toBe('a11y.chat.suggestion_hint');
  });
});
