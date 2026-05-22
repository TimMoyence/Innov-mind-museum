/**
 * RED — TD-RNAV-01 cycle 2, T1.4 (R5, R6, R10, R13).
 *
 * The screen `app/(stack)/confirm-email-change.tsx` does NOT exist yet — the
 * suite MUST fail on import (absence of feature), then turn green once the
 * screen is implemented in the GREEN phase.
 *
 * Same auto-submit matrix as verify-email but wired to
 * `authService.confirmEmailChange` (design §6.3).
 */
import '../helpers/test-utils';
import { render, screen, waitFor } from '@testing-library/react-native';

import { makeAppError } from '../helpers/factories';

const mockConfirmEmailChange = jest.fn();
jest.mock('@/features/auth/infrastructure/authApi', () => ({
  authService: {
    confirmEmailChange: (...args: unknown[]) => mockConfirmEmailChange(...args),
  },
}));

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockParams: { token?: string } = {};
// test-utils already installs the shared jest.mock('expo-router') with
// useLocalSearchParams: () => ({}). Re-declaring jest.mock here would be
// overwritten by the imported helper's factory (hoist order), so instead we
// MUTATE the shared mock — same pattern as
// __tests__/screens/chat-session-deep.test.tsx:57-61.
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

import ConfirmEmailChangeScreen from '@/app/(stack)/confirm-email-change';

const TOKEN = 'tok_confirm_xyz789';

const flushParams = (token?: string) => {
  delete mockParams.token;
  if (token !== undefined) mockParams.token = token;
};

describe('ConfirmEmailChangeScreen (R5/R6/R10/R13)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    flushParams(undefined);
  });

  it('R5 — calls confirmEmailChange once on mount with the token and shows success', async () => {
    flushParams(TOKEN);
    mockConfirmEmailChange.mockResolvedValue(undefined);

    render(<ConfirmEmailChangeScreen />);

    await waitFor(() => {
      expect(mockConfirmEmailChange).toHaveBeenCalledTimes(1);
    });
    expect(mockConfirmEmailChange).toHaveBeenCalledWith(TOKEN);
    await waitFor(() => {
      expect(screen.getByText('confirm_email_change.success')).toBeTruthy();
    });
  });

  it('R5 — a 400 rejection transitions to invalidToken (NOT error)', async () => {
    flushParams(TOKEN);
    mockConfirmEmailChange.mockRejectedValue(makeAppError({ kind: 'Validation', status: 400 }));

    render(<ConfirmEmailChangeScreen />);

    await waitFor(() => {
      expect(screen.getByText('confirm_email_change.invalidToken')).toBeTruthy();
    });
    expect(screen.queryByText('confirm_email_change.error')).toBeNull();
  });

  it('R10 — a non-400 rejection transitions to error', async () => {
    flushParams(TOKEN);
    mockConfirmEmailChange.mockRejectedValue(makeAppError({ kind: 'Unknown', status: 500 }));

    render(<ConfirmEmailChangeScreen />);

    await waitFor(() => {
      expect(screen.getByText('confirm_email_change.error')).toBeTruthy();
    });
  });

  it('R6 — missing token shows invalidToken, never calls the API, offers a login CTA', async () => {
    flushParams(undefined);

    render(<ConfirmEmailChangeScreen />);

    await waitFor(() => {
      expect(screen.getByText('confirm_email_change.invalidToken')).toBeTruthy();
    });
    expect(mockConfirmEmailChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText('confirm_email_change.cta_login')).toBeTruthy();
  });

  it('R13 — the token never reaches console.* or the error reporter', async () => {
    flushParams(TOKEN);
    mockConfirmEmailChange.mockRejectedValue(makeAppError({ kind: 'Unknown', status: 500 }));
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    render(<ConfirmEmailChangeScreen />);

    await waitFor(() => {
      expect(screen.getByText('confirm_email_change.error')).toBeTruthy();
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
