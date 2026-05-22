/**
 * RED — TD-RNAV-01 cycle 2, T1.3 (R4, R6, R10, R13).
 *
 * The screen `app/(stack)/verify-email.tsx` does NOT exist yet — the suite
 * MUST fail on import (absence of feature), then turn green once the screen
 * is implemented in the GREEN phase.
 *
 * Behaviour mirrored from web `EmailTokenFlow.tsx`:
 *  - mount with a non-empty token -> call verifyEmail(token) exactly once,
 *    loading -> success on resolve.
 *  - 400 (AppError status 400) -> invalidToken state (NOT error).
 *  - other rejection -> error state.
 *  - missing/empty token -> NO API call, invalidToken state, login CTA.
 *  - token NEVER passed to console.* / logger / Sentry (R13).
 */
import '../helpers/test-utils';
import { render, screen, waitFor } from '@testing-library/react-native';

import { makeAppError } from '../helpers/factories';

const mockVerifyEmail = jest.fn();
jest.mock('@/features/auth/infrastructure/authApi', () => ({
  authService: {
    verifyEmail: (...args: unknown[]) => mockVerifyEmail(...args),
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

// R13 — guard against the one-time token leaking to the error reporter (Sentry).
const mockReportError = jest.fn();
jest.mock('@/shared/observability/errorReporting', () => ({
  reportError: (...args: unknown[]) => mockReportError(...args),
}));

jest.mock('@/features/auth/application/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: false }),
}));

import VerifyEmailScreen from '@/app/(stack)/verify-email';

const TOKEN = 'tok_verify_abc123';

const flushParams = (token?: string) => {
  delete mockParams.token;
  if (token !== undefined) mockParams.token = token;
};

describe('VerifyEmailScreen (R4/R6/R10/R13)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    flushParams(undefined);
  });

  it('R4 — calls verifyEmail once on mount with the token and shows success', async () => {
    flushParams(TOKEN);
    mockVerifyEmail.mockResolvedValue({ verified: true });

    render(<VerifyEmailScreen />);

    await waitFor(() => {
      expect(mockVerifyEmail).toHaveBeenCalledTimes(1);
    });
    expect(mockVerifyEmail).toHaveBeenCalledWith(TOKEN);
    await waitFor(() => {
      expect(screen.getByText('verify_email.success')).toBeTruthy();
    });
  });

  it('R4 — a 400 rejection transitions to invalidToken (NOT error)', async () => {
    flushParams(TOKEN);
    mockVerifyEmail.mockRejectedValue(makeAppError({ kind: 'Validation', status: 400 }));

    render(<VerifyEmailScreen />);

    await waitFor(() => {
      expect(screen.getByText('verify_email.invalidToken')).toBeTruthy();
    });
    expect(screen.queryByText('verify_email.error')).toBeNull();
  });

  it('R10 — a non-400 rejection transitions to error', async () => {
    flushParams(TOKEN);
    mockVerifyEmail.mockRejectedValue(makeAppError({ kind: 'Unknown', status: 500 }));

    render(<VerifyEmailScreen />);

    await waitFor(() => {
      expect(screen.getByText('verify_email.error')).toBeTruthy();
    });
  });

  it('R6 — missing token shows invalidToken, never calls the API, offers a login CTA', async () => {
    flushParams(undefined);

    render(<VerifyEmailScreen />);

    await waitFor(() => {
      expect(screen.getByText('verify_email.invalidToken')).toBeTruthy();
    });
    expect(mockVerifyEmail).not.toHaveBeenCalled();
    expect(screen.getByLabelText('verify_email.cta_login')).toBeTruthy();
  });

  it('R13 — the token never reaches console.* or the error reporter', async () => {
    flushParams(TOKEN);
    mockVerifyEmail.mockRejectedValue(makeAppError({ kind: 'Unknown', status: 500 }));
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    render(<VerifyEmailScreen />);

    await waitFor(() => {
      expect(screen.getByText('verify_email.error')).toBeTruthy();
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
