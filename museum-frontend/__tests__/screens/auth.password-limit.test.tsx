import '../helpers/test-utils';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithQueryClient as render } from '../helpers/data/renderWithQueryClient';

const mockLogin = jest.fn();
const mockRegister = jest.fn();

jest.mock('@/features/auth/application/AuthContext', () => ({
  useAuth: () => ({ loginWithSession: jest.fn() }),
}));

jest.mock('@/features/auth/infrastructure/authApi', () => ({
  authService: {
    login: (...args: unknown[]) => mockLogin(...args) as Promise<unknown>,
    register: (...args: unknown[]) => mockRegister(...args) as Promise<unknown>,
    forgotPassword: jest.fn(),
  },
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
  ONBOARDING_ROUTE: '/(stack)/onboarding',
}));

jest.mock('expo-apple-authentication', () => ({
  AppleAuthenticationButton: jest.requireActual<{ View: unknown }>('react-native').View,
  AppleAuthenticationButtonType: { SIGN_IN: 0 },
  AppleAuthenticationButtonStyle: { BLACK: 0 },
}));

import AuthScreen from '@/app/auth';

const EMAIL = 'curator@museum.fr';

async function typeCredentials(password: string): Promise<void> {
  fireEvent.changeText(screen.getByTestId('email-input'), EMAIL);
  fireEvent.changeText(screen.getByTestId('password-input'), password);
  await waitFor(() => {
    expect(screen.getByTestId('password-input').props.value).toBe(password);
  });
}

async function register(password: string): Promise<void> {
  render(<AuthScreen />);
  fireEvent.press(screen.getByLabelText('a11y.auth.toggle_register'));
  await waitFor(() => {
    expect(screen.getByLabelText('a11y.auth.register_button')).toBeTruthy();
  });
  await typeCredentials(password);
  fireEvent.changeText(screen.getByTestId('firstname-input'), 'Ada');
  fireEvent.changeText(screen.getByTestId('lastname-input'), 'Lovelace');
  fireEvent.changeText(screen.getByLabelText('auth.date_of_birth_a11y'), '2000-01-01');
  fireEvent.press(screen.getByLabelText('a11y.auth.gdpr_checkbox'));
  await waitFor(() => {
    expect(
      screen.getByLabelText('a11y.auth.register_button').props.accessibilityState.disabled,
    ).toBe(false);
  });
  fireEvent.press(screen.getByLabelText('a11y.auth.register_button'));
}

describe('L3 · la borne du mot de passe s’applique à la création, pas à la connexion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLogin.mockResolvedValue({ accessToken: 'tok', refreshToken: 'ref' });
    mockRegister.mockResolvedValue({ user: { id: 1, email: EMAIL } });
  });

  it('connexion : un mot de passe existant de 4 emoji (accepté par l’ancien serveur) part au serveur', async () => {
    render(<AuthScreen />);
    await typeCredentials('😀😀😀😀');
    fireEvent.press(screen.getByLabelText('a11y.auth.login_button'));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith(EMAIL, '😀😀😀😀');
    });
  });

  it('inscription : 129 caractères sont signalés sur le champ, rien ne part', async () => {
    await register('p'.repeat(129));

    await waitFor(() => {
      expect(screen.getByTestId('auth-password-error')).toBeTruthy();
    });
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('inscription : 128 caractères partent au serveur', async () => {
    await register('p'.repeat(128));

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByTestId('auth-password-error')).toBeNull();
  });
});
