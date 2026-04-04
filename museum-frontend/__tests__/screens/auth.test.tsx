import '../helpers/test-utils';
import { Alert } from 'react-native';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

// ── Screen-specific mocks ────────────────────────────────────────────────────

const mockLoginWithSession = jest.fn();
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ loginWithSession: mockLoginWithSession }),
}));

const mockLogin = jest.fn();
const mockRegister = jest.fn();
const mockForgotPassword = jest.fn();
jest.mock('@/features/auth/infrastructure/authApi', () => ({
  authService: {
    login: mockLogin,
    register: mockRegister,
    forgotPassword: mockForgotPassword,
  },
}));

const mockHandleAppleSignIn = jest.fn();
const mockHandleGoogleSignIn = jest.fn();
jest.mock('@/features/auth/application/useSocialLogin', () => ({
  useSocialLogin: () => ({
    handleAppleSignIn: mockHandleAppleSignIn,
    handleGoogleSignIn: mockHandleGoogleSignIn,
    isSocialLoading: false,
    appleAuthAvailable: true,
  }),
}));

jest.mock('@/features/auth/routes', () => ({
  ONBOARDING_ROUTE: '/(stack)/onboarding',
}));

jest.mock('expo-apple-authentication', () => {
  const { View } = require('react-native');
  return {
    AppleAuthenticationButton: (props: any) => <View {...props} testID="apple-auth-button" />,
    AppleAuthenticationButtonType: { SIGN_IN: 0 },
    AppleAuthenticationButtonStyle: { BLACK: 0 },
  };
});

import AuthScreen from '@/app/auth';

describe('AuthScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(<AuthScreen />);
    expect(screen.getByLabelText('a11y.auth.email_input')).toBeTruthy();
    expect(screen.getByLabelText('a11y.auth.password_input')).toBeTruthy();
  });

  it('displays login mode title', () => {
    render(<AuthScreen />);
    expect(screen.getByText('auth.welcome_back')).toBeTruthy();
  });

  it('shows Google sign-in button', () => {
    render(<AuthScreen />);
    expect(screen.getByLabelText('a11y.auth.google_signin')).toBeTruthy();
  });

  it('shows Apple sign-in button when available', () => {
    render(<AuthScreen />);
    expect(screen.getByLabelText('a11y.auth.apple_signin')).toBeTruthy();
  });

  it('toggles to register mode and back', () => {
    render(<AuthScreen />);
    expect(screen.getByText('auth.welcome_back')).toBeTruthy();

    // Toggle to register
    fireEvent.press(screen.getByLabelText('a11y.auth.toggle_register'));
    expect(screen.getByText('auth.create_account')).toBeTruthy();

    // Toggle back to login
    fireEvent.press(screen.getByLabelText('a11y.auth.toggle_login'));
    expect(screen.getByText('auth.welcome_back')).toBeTruthy();
  });

  it('shows firstname and lastname fields only in register mode', () => {
    render(<AuthScreen />);
    // Login mode: no name fields
    expect(screen.queryByLabelText('a11y.auth.firstname_input')).toBeNull();
    expect(screen.queryByLabelText('a11y.auth.lastname_input')).toBeNull();

    // Switch to register mode
    fireEvent.press(screen.getByLabelText('a11y.auth.toggle_register'));
    expect(screen.getByLabelText('a11y.auth.firstname_input')).toBeTruthy();
    expect(screen.getByLabelText('a11y.auth.lastname_input')).toBeTruthy();
  });

  it('shows GDPR checkbox only in register mode', () => {
    render(<AuthScreen />);
    expect(screen.queryByLabelText('a11y.auth.gdpr_checkbox')).toBeNull();

    fireEvent.press(screen.getByLabelText('a11y.auth.toggle_register'));
    expect(screen.getByLabelText('a11y.auth.gdpr_checkbox')).toBeTruthy();
  });

  it('shows forgot password button in login mode', () => {
    render(<AuthScreen />);
    expect(screen.getByLabelText('a11y.auth.forgot_password')).toBeTruthy();
  });

  it('forgot password alerts when email is empty', () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    render(<AuthScreen />);
    fireEvent.press(screen.getByLabelText('a11y.auth.forgot_password'));
    expect(alertSpy).toHaveBeenCalledWith('common.error', 'auth.enter_email_for_reset');
  });

  it('forgot password shows confirmation when email is provided', () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    render(<AuthScreen />);
    fireEvent.changeText(screen.getByLabelText('a11y.auth.email_input'), 'test@example.com');
    fireEvent.press(screen.getByLabelText('a11y.auth.forgot_password'));
    expect(alertSpy).toHaveBeenCalledWith(
      'auth.password_reset_title',
      'auth.password_reset_confirm',
      expect.any(Array),
    );
  });

  it('login alerts when fields are empty', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    render(<AuthScreen />);
    fireEvent.press(screen.getByLabelText('a11y.auth.login_button'));
    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('common.error', 'auth.fill_all_fields');
    });
  });

  it('register button is disabled until GDPR checkbox is checked', () => {
    render(<AuthScreen />);
    fireEvent.press(screen.getByLabelText('a11y.auth.toggle_register'));
    const registerButton = screen.getByLabelText('a11y.auth.register_button');
    expect(registerButton.props.accessibilityState.disabled).toBe(true);

    // Check GDPR
    fireEvent.press(screen.getByLabelText('a11y.auth.gdpr_checkbox'));
    expect(registerButton.props.accessibilityState.disabled).toBe(false);
  });

  it('displays separator with social login text', () => {
    render(<AuthScreen />);
    expect(screen.getByText('common.or_continue_with')).toBeTruthy();
  });

  it('shows legal notice text in login mode', () => {
    render(<AuthScreen />);
    expect(screen.getByText('auth.legal_notice')).toBeTruthy();
  });

  it('hides legal notice text in register mode', () => {
    render(<AuthScreen />);
    fireEvent.press(screen.getByLabelText('a11y.auth.toggle_register'));
    expect(screen.queryByText('auth.legal_notice')).toBeNull();
  });
});
