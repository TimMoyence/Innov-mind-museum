import '../helpers/test-utils';
import { Alert } from 'react-native';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithQueryClient as render } from '../helpers/data/renderWithQueryClient';

const mockLoginWithSession = jest.fn();
jest.mock('@/features/auth/application/AuthContext', () => ({
  useAuth: () => ({ loginWithSession: mockLoginWithSession }),
}));

const mockLogin = jest.fn();
const mockRegister = jest.fn();
const mockForgotPassword = jest.fn();
jest.mock('@/features/auth/infrastructure/authApi', () => ({
  authService: {
    login: (...args: unknown[]) => mockLogin(...args),
    register: (...args: unknown[]) => mockRegister(...args),
    forgotPassword: (...args: unknown[]) => mockForgotPassword(...args),
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

  it('toggles to register mode and back', async () => {
    render(<AuthScreen />);
    expect(screen.getByText('auth.welcome_back')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('a11y.auth.toggle_register'));
    await waitFor(() => {
      expect(screen.getByText('auth.create_account')).toBeTruthy();
    });

    fireEvent.press(screen.getByLabelText('a11y.auth.toggle_login'));
    await waitFor(() => {
      expect(screen.getByText('auth.welcome_back')).toBeTruthy();
    });
  });

  it('shows firstname and lastname fields only in register mode', async () => {
    render(<AuthScreen />);
    expect(screen.queryByLabelText('a11y.auth.firstname_input')).toBeNull();
    expect(screen.queryByLabelText('a11y.auth.lastname_input')).toBeNull();

    fireEvent.press(screen.getByLabelText('a11y.auth.toggle_register'));
    await waitFor(() => {
      expect(screen.getByLabelText('a11y.auth.firstname_input')).toBeTruthy();
      expect(screen.getByLabelText('a11y.auth.lastname_input')).toBeTruthy();
    });
  });

  it('shows GDPR checkbox only in register mode', async () => {
    render(<AuthScreen />);
    expect(screen.queryByLabelText('a11y.auth.gdpr_checkbox')).toBeNull();

    fireEvent.press(screen.getByLabelText('a11y.auth.toggle_register'));
    await waitFor(() => {
      expect(screen.getByLabelText('a11y.auth.gdpr_checkbox')).toBeTruthy();
    });
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

  it('login submit with empty fields surfaces inline Zod errors (TD-RHF-02)', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    render(<AuthScreen />);
    fireEvent.press(screen.getByLabelText('a11y.auth.login_button'));
    await waitFor(() => {
      expect(screen.getByTestId('auth-email-error')).toBeTruthy();
    });
    expect(alertSpy).not.toHaveBeenCalledWith('common.error', 'auth.fill_all_fields');
    alertSpy.mockRestore();
  });

  it('register button is disabled until GDPR checkbox is checked and DOB is filled', async () => {
    render(<AuthScreen />);
    fireEvent.press(screen.getByLabelText('a11y.auth.toggle_register'));
    const registerButton = await waitFor(() => screen.getByLabelText('a11y.auth.register_button'));
    expect(registerButton.props.accessibilityState.disabled).toBe(true);

    fireEvent.changeText(screen.getByLabelText('auth.date_of_birth_a11y'), '2000-01-01');
    fireEvent.press(screen.getByLabelText('a11y.auth.gdpr_checkbox'));
    await waitFor(() => {
      expect(registerButton.props.accessibilityState.disabled).toBe(false);
    });
  });

  it('displays separator with social login text', () => {
    render(<AuthScreen />);
    expect(screen.getByText('common.or_continue_with')).toBeTruthy();
  });

  it('shows legal notice text in login mode', () => {
    render(<AuthScreen />);
    expect(screen.getByText('auth.legal_notice')).toBeTruthy();
  });

  it('hides legal notice text in register mode', async () => {
    render(<AuthScreen />);
    fireEvent.press(screen.getByLabelText('a11y.auth.toggle_register'));
    await waitFor(() => {
      expect(screen.getByLabelText('a11y.auth.firstname_input')).toBeTruthy();
    });
    expect(screen.queryByText('auth.legal_notice')).toBeNull();
  });

  it('RHF: form fields update — email input value reflects typed text', async () => {
    render(<AuthScreen />);
    const emailInput = screen.getByLabelText('a11y.auth.email_input');

    fireEvent.changeText(emailInput, 'user@example.com');
    await waitFor(() => {
      expect(emailInput.props.value).toBe('user@example.com');
    });
  });

  it('RHF: valid email + valid password invokes authService.login with watched values', async () => {
    mockLogin.mockResolvedValueOnce({ accessToken: 'tok', refreshToken: 'ref' });
    render(<AuthScreen />);

    fireEvent.changeText(screen.getByTestId('email-input'), 'user@example.com');
    fireEvent.changeText(screen.getByTestId('password-input'), 'secret1234');

    await waitFor(() => {
      expect(screen.getByTestId('email-input').props.value).toBe('user@example.com');
    });
    await waitFor(() => {
      expect(screen.getByTestId('password-input').props.value).toBe('secret1234');
    });

    fireEvent.press(screen.getByLabelText('a11y.auth.login_button'));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('user@example.com', 'secret1234');
    });
  });

  it('RHF: empty email submit surfaces inline error and skips the business mutation (TD-RHF-02)', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    render(<AuthScreen />);

    fireEvent.press(screen.getByLabelText('a11y.auth.login_button'));

    await waitFor(() => {
      expect(screen.getByTestId('auth-email-error')).toBeTruthy();
    });
    expect(mockLogin).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalledWith('common.error', 'auth.fill_all_fields');

    alertSpy.mockRestore();
  });
});

describe('L2 · la connexion applique la règle e-mail partagée', () => {
  const DOMAIN = '@museum.fr';
  const emailOfLength = (length: number): string => 'a'.repeat(length - DOMAIN.length) + DOMAIN;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('une adresse de 254 caractères part à la connexion', async () => {
    mockLogin.mockResolvedValueOnce({ accessToken: 'tok', refreshToken: 'ref' });
    render(<AuthScreen />);

    fireEvent.changeText(screen.getByTestId('email-input'), emailOfLength(254));
    fireEvent.changeText(screen.getByTestId('password-input'), 'secret1234');
    fireEvent.press(screen.getByLabelText('a11y.auth.login_button'));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith(emailOfLength(254), 'secret1234');
    });
    expect(screen.queryByTestId('auth-email-error')).toBeNull();
  });

  it('une adresse de 255 caractères est signalée sur le champ, la connexion ne part pas', async () => {
    render(<AuthScreen />);

    fireEvent.changeText(screen.getByTestId('email-input'), emailOfLength(255));
    fireEvent.changeText(screen.getByTestId('password-input'), 'secret1234');
    fireEvent.press(screen.getByLabelText('a11y.auth.login_button'));

    await waitFor(() => {
      expect(screen.getByTestId('auth-email-error')).toBeTruthy();
    });
    expect(mockLogin).not.toHaveBeenCalled();
  });
});
