import '../helpers/test-utils';
import { render, screen } from '@testing-library/react-native';

// ── Screen-specific mocks ────────────────────────────────────────────────────

jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ loginWithSession: jest.fn() }),
}));

jest.mock('@/features/auth/infrastructure/authApi', () => ({
  authService: {
    login: jest.fn(),
    register: jest.fn(),
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

jest.mock('expo-apple-authentication', () => {
  const { View } = require('react-native');
  return {
    AppleAuthenticationButton: View,
    AppleAuthenticationButtonType: { SIGN_IN: 0 },
    AppleAuthenticationButtonStyle: { BLACK: 0 },
  };
});

import AuthScreen from '@/app/auth';

describe('AuthScreen', () => {
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
});
