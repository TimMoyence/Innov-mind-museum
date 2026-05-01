import '../helpers/test-utils';
import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithQueryClient as render } from '../helpers/data/renderWithQueryClient';

// ── Screen-specific mocks ────────────────────────────────────────────────────

jest.mock('@/features/auth/application/AuthContext', () => ({
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

import AuthScreen from '@/app/auth';

describe('AuthScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders login form with email and password inputs', () => {
    render(<AuthScreen />);

    expect(screen.getByLabelText('a11y.auth.email_input')).toBeTruthy();
    expect(screen.getByLabelText('a11y.auth.password_input')).toBeTruthy();

    // Title should show login welcome text
    expect(screen.getByText('auth.welcome_back')).toBeTruthy();
  });

  it('toggles to register mode and shows firstname/lastname fields', async () => {
    render(<AuthScreen />);

    // Initially in login mode — no name fields
    expect(screen.queryByLabelText('a11y.auth.firstname_input')).toBeNull();
    expect(screen.queryByLabelText('a11y.auth.lastname_input')).toBeNull();

    // Toggle to register mode
    const toggleButton = screen.getByLabelText('a11y.auth.toggle_register');
    fireEvent.press(toggleButton);

    // Now in register mode — name fields should be visible
    await waitFor(() => {
      expect(screen.getByLabelText('a11y.auth.firstname_input')).toBeTruthy();
      expect(screen.getByLabelText('a11y.auth.lastname_input')).toBeTruthy();
      expect(screen.getByText('auth.create_account')).toBeTruthy();
    });
  });

  it('shows GDPR checkbox in register mode', async () => {
    render(<AuthScreen />);

    // Toggle to register mode
    const toggleButton = screen.getByLabelText('a11y.auth.toggle_register');
    fireEvent.press(toggleButton);

    await waitFor(() => {
      const checkbox = screen.getByLabelText('a11y.auth.gdpr_checkbox');
      expect(checkbox).toBeTruthy();
      expect(checkbox.props.accessibilityRole).toBe('checkbox');
    });
  });

  it('shows correct submit button text for login vs register mode', async () => {
    render(<AuthScreen />);

    // Login mode — shows login text
    expect(screen.getByText('auth.log_in')).toBeTruthy();

    // Toggle to register
    const toggleButton = screen.getByLabelText('a11y.auth.toggle_register');
    fireEvent.press(toggleButton);

    // Register mode — shows sign up text
    await waitFor(() => {
      expect(screen.getByText('auth.sign_up')).toBeTruthy();
      expect(screen.queryByText('auth.log_in')).toBeNull();
    });
  });

  it('shows forgot password link only in login mode', async () => {
    render(<AuthScreen />);

    // Login mode — forgot password visible
    expect(screen.getByText('auth.forgot_password')).toBeTruthy();

    // Toggle to register
    const toggleButton = screen.getByLabelText('a11y.auth.toggle_register');
    fireEvent.press(toggleButton);

    // Wait for register mode indicator to confirm toggle happened
    await waitFor(() => {
      expect(screen.getByLabelText('a11y.auth.firstname_input')).toBeTruthy();
    });

    // Register mode — forgot password hidden
    expect(screen.queryByText('auth.forgot_password')).toBeNull();
  });
});
