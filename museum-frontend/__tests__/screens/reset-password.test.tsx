import '../helpers/test-utils';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

import { makeAppError } from '../helpers/factories';

const mockResetPassword = jest.fn();
jest.mock('@/features/auth/infrastructure/authApi', () => ({
  authService: {
    resetPassword: (...args: unknown[]) => mockResetPassword(...args),
  },
}));

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockParams: { token?: string } = {};
const mockExpoRouter = jest.requireMock<Record<string, unknown>>('expo-router');
mockExpoRouter.useLocalSearchParams = () => mockParams;
mockExpoRouter.router = {
  replace: (...args: unknown[]) => mockReplace(...args),
  push: (...args: unknown[]) => mockPush(...args),
  back: jest.fn(),
};

const mockReportError = jest.fn();
jest.mock('@/shared/observability/errorReporting', () => ({
  reportError: (...args: unknown[]) => mockReportError(...args),
}));

jest.mock('@/features/auth/application/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: false }),
}));

import ResetPasswordScreen from '@/app/(stack)/reset-password';

const TOKEN = 'tok_reset_q1w2e3';

const flushParams = (token?: string) => {
  delete mockParams.token;
  if (token !== undefined) mockParams.token = token;
};

const fillAndSubmit = (newPassword: string, confirmPassword: string) => {
  fireEvent.changeText(screen.getByLabelText('reset_password.new'), newPassword);
  fireEvent.changeText(screen.getByLabelText('reset_password.confirm'), confirmPassword);
  fireEvent.press(screen.getByLabelText('reset_password.submit'));
};

describe('ResetPasswordScreen (R7/R8/R9/R6/R10/R13)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    flushParams(TOKEN);
  });

  it('R7 — valid inputs call resetPassword once then show success + login CTA', async () => {
    mockResetPassword.mockResolvedValue(undefined);

    render(<ResetPasswordScreen />);
    fillAndSubmit('newpass123', 'newpass123');

    await waitFor(() => {
      expect(mockResetPassword).toHaveBeenCalledTimes(1);
    });
    expect(mockResetPassword).toHaveBeenCalledWith(TOKEN, 'newpass123');
    await waitFor(() => {
      expect(screen.getByText('reset_password.success')).toBeTruthy();
    });
    expect(screen.getByLabelText('reset_password.cta_login')).toBeTruthy();
  });

  it('R8 — a password shorter than 8 shows error_short and does NOT call the API', async () => {
    render(<ResetPasswordScreen />);
    fillAndSubmit('short', 'short');

    await waitFor(() => {
      expect(screen.getByText('reset_password.error_short')).toBeTruthy();
    });
    expect(mockResetPassword).not.toHaveBeenCalled();
  });

  it('L3 · un nouveau mot de passe garde 128 caractères sur 129 saisis, comme le serveur', async () => {
    mockResetPassword.mockResolvedValue(undefined);

    render(<ResetPasswordScreen />);
    fillAndSubmit('p'.repeat(129), 'p'.repeat(129));

    await waitFor(() => {
      expect(mockResetPassword).toHaveBeenCalledWith(TOKEN, 'p'.repeat(128));
    });
  });

  it('R9 — a mismatch shows error_mismatch and does NOT call the API', async () => {
    render(<ResetPasswordScreen />);
    fillAndSubmit('newpass123', 'newpass999');

    await waitFor(() => {
      expect(screen.getByText('reset_password.error_mismatch')).toBeTruthy();
    });
    expect(mockResetPassword).not.toHaveBeenCalled();
  });

  it('R6 — a missing token shows invalidToken + login CTA and never calls the API', async () => {
    flushParams(undefined);

    render(<ResetPasswordScreen />);

    await waitFor(() => {
      expect(screen.getByText('reset_password.invalidToken')).toBeTruthy();
    });
    expect(screen.getByLabelText('reset_password.cta_login')).toBeTruthy();
    expect(mockResetPassword).not.toHaveBeenCalled();
  });

  it('R10 — a rejection shows a localized error and never logs the token (R13)', async () => {
    mockResetPassword.mockRejectedValue(makeAppError({ kind: 'Unknown', status: 500 }));
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    render(<ResetPasswordScreen />);
    fillAndSubmit('newpass123', 'newpass123');

    await waitFor(() => {
      expect(screen.getByText('reset_password.error')).toBeTruthy();
    });

    const carriesToken = (mockCall: unknown[]): boolean =>
      mockCall.some((arg) => JSON.stringify(arg ?? '').includes(TOKEN));
    expect(logSpy.mock.calls.some(carriesToken)).toBe(false);
    expect(warnSpy.mock.calls.some(carriesToken)).toBe(false);
    expect(errorSpy.mock.calls.some(carriesToken)).toBe(false);
    expect(mockReportError.mock.calls.some(carriesToken)).toBe(false);

    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
