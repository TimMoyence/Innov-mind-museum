/**
 * T5.2 RED — LoginForm MFA challenge step interaction tests (R2-R15).
 *
 * Drives the real <LoginForm> through the real <AuthProvider> with `@/lib/api`
 * mocked per-branch (keyed by request path) and `next/navigation` mocked. Every
 * assertion is on OBSERVABLE DOM / router / cookie state — never on component
 * internals (memory feedback_opaque_animated_value_test_contract).
 *
 * MUST FAIL today: LoginForm has no challenge step — after a MfaRequiredResponse
 * it never renders a code input, so the `findBy*` queries time out / the api
 * never receives the `/mfa/challenge` call.
 *
 * Branch coverage: R2/R15 (challenge renders, code input focused), R3 (challenge
 * api args), R4 (cookie + push), R5/R6 (recovery toggle + args + remaining),
 * R7 (enrollment redirect), R8 (401 invalid → stays + alert + cleared+refocus +
 * no push), R9 (429 distinct msg, one call), R10 (double-submit one call),
 * R11 (INVALID_MFA_SESSION → back to credentials), R14 (empty/short → disabled).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { AuthProvider } from '@/lib/auth';
import { AdminDictProvider } from '@/lib/admin-dictionary';
import LoginForm from '@/components/admin/LoginForm';
import { ApiError } from '@/lib/api';
import type * as ApiModule from '@/lib/api';
import { mockAdminDict } from '@/__tests__/helpers/admin-dict.fixture';

const mockPush = vi.fn();
const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => '/en/admin/login',
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof ApiModule>('@/lib/api');
  return {
    ...actual,
    apiPost: vi.fn(),
    apiGet: vi.fn(),
    registerLogoutHandler: vi.fn(),
  };
});

const dict = mockAdminDict.login;

const SUCCESS_SESSION = {
  accessToken: 'at',
  refreshToken: 'rt',
  expiresIn: 900,
  refreshExpiresIn: 86400,
  user: {
    id: 1,
    email: 'admin@test.com',
    firstname: 'Admin',
    lastname: null,
    role: 'admin' as const,
    onboardingCompleted: true,
  },
};

const MFA_REQUIRED = {
  mfaRequired: true as const,
  mfaSessionToken: 'mfa-sess-xyz',
  mfaSessionExpiresIn: 300,
};

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AdminDictProvider dict={mockAdminDict} locale="en">
      <AuthProvider>{children}</AuthProvider>
    </AdminDictProvider>
  );
}

/** Routes the per-path mock impl. */
function routeApiPost(
  handlers: Partial<Record<'login' | 'challenge' | 'recovery', () => Promise<unknown>>>,
): (path: string) => Promise<unknown> {
  return (path: string) => {
    if (path.endsWith('/api/auth/login')) return (handlers.login ?? notMocked)('login');
    if (path.endsWith('/mfa/challenge')) return (handlers.challenge ?? notMocked)('challenge');
    if (path.endsWith('/mfa/recovery')) return (handlers.recovery ?? notMocked)('recovery');
    return notMocked(path);
  };
  function notMocked(p: string): Promise<never> {
    return Promise.reject(new Error(`unexpected apiPost to ${p}`));
  }
}

async function submitCredentials() {
  fireEvent.change(screen.getByPlaceholderText('Email'), {
    target: { value: 'admin@test.com' },
  });
  fireEvent.change(screen.getByPlaceholderText('Password'), {
    target: { value: 'secret123' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
}

describe('LoginForm — MFA challenge step', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.cookie = 'admin-authz=; Path=/; Max-Age=0';
  });

  it('R2/R15 — MfaRequiredResponse renders the challenge step with a focused code input', async () => {
    const { apiPost } = await import('@/lib/api');
    vi.mocked(apiPost).mockImplementation(
      routeApiPost({ login: () => Promise.resolve(MFA_REQUIRED) }) as typeof apiPost,
    );

    render(
      <Providers>
        <LoginForm dict={dict} />
      </Providers>,
    );
    await submitCredentials();

    const codeInput = await screen.findByLabelText(dict.mfaCodeLabel);
    expect(codeInput).toBeInTheDocument();
    await waitFor(() => {
      expect(document.activeElement).toBe(codeInput);
    });
    // We never navigated away on the mfa-required branch.
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('R3 — submitting a 6-digit code calls /mfa/challenge with exactly { mfaSessionToken, code }', async () => {
    const { apiPost } = await import('@/lib/api');
    const challenge = vi.fn(() => Promise.resolve(SUCCESS_SESSION));
    vi.mocked(apiPost).mockImplementation(
      routeApiPost({
        login: () => Promise.resolve(MFA_REQUIRED),
        challenge,
      }) as typeof apiPost,
    );

    render(
      <Providers>
        <LoginForm dict={dict} />
      </Providers>,
    );
    await submitCredentials();

    const codeInput = await screen.findByLabelText(dict.mfaCodeLabel);
    fireEvent.change(codeInput, { target: { value: ' 123456 ' } });
    fireEvent.click(screen.getByRole('button', { name: dict.mfaSubmit }));

    await waitFor(() => {
      expect(vi.mocked(apiPost)).toHaveBeenCalledWith(
        '/api/auth/mfa/challenge',
        { mfaSessionToken: 'mfa-sess-xyz', code: '123456' },
        expect.objectContaining({ skipAuthRefresh: true }),
      );
    });
  });

  it('R4 — a valid code establishes the session (admin-authz cookie) and routes to /en/admin', async () => {
    const { apiPost } = await import('@/lib/api');
    vi.mocked(apiPost).mockImplementation(
      routeApiPost({
        login: () => Promise.resolve(MFA_REQUIRED),
        challenge: () => Promise.resolve(SUCCESS_SESSION),
      }) as typeof apiPost,
    );

    render(
      <Providers>
        <LoginForm dict={dict} />
      </Providers>,
    );
    await submitCredentials();

    const codeInput = await screen.findByLabelText(dict.mfaCodeLabel);
    fireEvent.change(codeInput, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: dict.mfaSubmit }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/en/admin');
    });
    expect(document.cookie).toContain('admin-authz=1');
  });

  it('R5/R6 — recovery toggle calls /mfa/recovery with { mfaSessionToken, recoveryCode } and shows remaining', async () => {
    const { apiPost } = await import('@/lib/api');
    vi.mocked(apiPost).mockImplementation(
      routeApiPost({
        login: () => Promise.resolve(MFA_REQUIRED),
        recovery: () => Promise.resolve({ ...SUCCESS_SESSION, remainingRecoveryCodes: 3 }),
      }) as typeof apiPost,
    );

    render(
      <Providers>
        <LoginForm dict={dict} />
      </Providers>,
    );
    await submitCredentials();
    await screen.findByLabelText(dict.mfaCodeLabel);

    fireEvent.click(screen.getByRole('button', { name: dict.mfaUseRecovery }));

    const recoveryInput = await screen.findByLabelText(dict.mfaRecoveryLabel);
    fireEvent.change(recoveryInput, { target: { value: 'TEST00-CODE00' } });
    fireEvent.click(screen.getByRole('button', { name: dict.mfaRecoverySubmit }));

    await waitFor(() => {
      expect(vi.mocked(apiPost)).toHaveBeenCalledWith(
        '/api/auth/mfa/recovery',
        { mfaSessionToken: 'mfa-sess-xyz', recoveryCode: 'TEST00-CODE00' },
        expect.objectContaining({ skipAuthRefresh: true }),
      );
    });
    // The remaining-codes count (3) is surfaced to the admin.
    await waitFor(() => {
      expect(document.body.textContent).toContain('3');
    });
  });

  it('R7 — an enrollment-required login routes to /en/admin/mfa without a crash or generic error', async () => {
    const { apiPost } = await import('@/lib/api');
    const enrollErr = new ApiError(403, 'Forbidden', 'MFA enrollment required');
    (enrollErr as ApiError & { body: unknown }).body = {
      mfaEnrollmentRequired: true,
      redirectTo: '/admin/mfa',
    };
    vi.mocked(apiPost).mockImplementation(
      routeApiPost({ login: () => Promise.reject(enrollErr) }) as typeof apiPost,
    );

    render(
      <Providers>
        <LoginForm dict={dict} />
      </Providers>,
    );
    await submitCredentials();

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/en/admin/mfa');
    });
    expect(screen.queryByText(dict.error)).not.toBeInTheDocument();
  });

  it('R8 — a 401 INVALID_MFA_CODE keeps the step, shows a live-region error, clears + refocuses the input, no push', async () => {
    const { apiPost } = await import('@/lib/api');
    const invalid = new ApiError(401, 'Unauthorized', 'bad code');
    (invalid as ApiError & { body: unknown }).body = {
      error: { code: 'INVALID_MFA_CODE', message: 'bad code' },
    };
    vi.mocked(apiPost).mockImplementation(
      routeApiPost({
        login: () => Promise.resolve(MFA_REQUIRED),
        challenge: () => Promise.reject(invalid),
      }) as typeof apiPost,
    );

    render(
      <Providers>
        <LoginForm dict={dict} />
      </Providers>,
    );
    await submitCredentials();

    const codeInput = await screen.findByLabelText(dict.mfaCodeLabel);
    fireEvent.change(codeInput, { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: dict.mfaSubmit }));

    // The localized invalid-code message appears in a live region.
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(dict.mfaErrorInvalid)).toBeInTheDocument();
    // Stayed on the challenge step; never navigated.
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByLabelText(dict.mfaCodeLabel)).toBeInTheDocument();
    // Input cleared and re-focused for retry.
    await waitFor(() => {
      expect(screen.getByLabelText<HTMLInputElement>(dict.mfaCodeLabel).value).toBe('');
      expect(document.activeElement).toBe(screen.getByLabelText(dict.mfaCodeLabel));
    });
  });

  it('R9 — a 429 shows a distinct rate-limit message and fires exactly one challenge call (no auto-retry)', async () => {
    const { apiPost } = await import('@/lib/api');
    const challenge = vi.fn(() => {
      const err = new ApiError(429, 'Too Many Requests', 'rate limited');
      (err as ApiError & { body: unknown }).body = {
        error: { code: 'RATE_LIMITED', message: 'rate limited' },
      };
      return Promise.reject(err);
    });
    vi.mocked(apiPost).mockImplementation(
      routeApiPost({ login: () => Promise.resolve(MFA_REQUIRED), challenge }) as typeof apiPost,
    );

    render(
      <Providers>
        <LoginForm dict={dict} />
      </Providers>,
    );
    await submitCredentials();

    const codeInput = await screen.findByLabelText(dict.mfaCodeLabel);
    fireEvent.change(codeInput, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: dict.mfaSubmit }));

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(dict.mfaErrorRateLimited)).toBeInTheDocument();
    expect(challenge).toHaveBeenCalledTimes(1);
  });

  it('R10 — double-submit while in-flight fires exactly one challenge call', async () => {
    const { apiPost } = await import('@/lib/api');
    let resolveChallenge: (v: unknown) => void = () => {};
    const challenge = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveChallenge = resolve;
        }),
    );
    vi.mocked(apiPost).mockImplementation(
      routeApiPost({ login: () => Promise.resolve(MFA_REQUIRED), challenge }) as typeof apiPost,
    );

    render(
      <Providers>
        <LoginForm dict={dict} />
      </Providers>,
    );
    await submitCredentials();

    const codeInput = await screen.findByLabelText(dict.mfaCodeLabel);
    fireEvent.change(codeInput, { target: { value: '123456' } });
    const submit = screen.getByRole('button', { name: dict.mfaSubmit });
    fireEvent.click(submit);
    fireEvent.click(submit); // second tap while the first is in flight

    await waitFor(() => {
      expect(challenge).toHaveBeenCalledTimes(1);
    });
    resolveChallenge(SUCCESS_SESSION);
  });

  it('R11 — INVALID_MFA_SESSION returns to the credentials step with an expired message', async () => {
    const { apiPost } = await import('@/lib/api');
    const expired = new ApiError(401, 'Unauthorized', 'expired');
    (expired as ApiError & { body: unknown }).body = {
      error: { code: 'INVALID_MFA_SESSION', message: 'expired' },
    };
    vi.mocked(apiPost).mockImplementation(
      routeApiPost({
        login: () => Promise.resolve(MFA_REQUIRED),
        challenge: () => Promise.reject(expired),
      }) as typeof apiPost,
    );

    render(
      <Providers>
        <LoginForm dict={dict} />
      </Providers>,
    );
    await submitCredentials();

    const codeInput = await screen.findByLabelText(dict.mfaCodeLabel);
    fireEvent.change(codeInput, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: dict.mfaSubmit }));

    // Back on the credentials step: the email field is visible again.
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Email')).toBeInTheDocument();
    });
    expect(screen.getByText(dict.mfaErrorExpired)).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('R14 — the challenge submit is disabled for an empty / too-short code and fires no api call', async () => {
    const { apiPost } = await import('@/lib/api');
    const challenge = vi.fn(() => Promise.resolve(SUCCESS_SESSION));
    vi.mocked(apiPost).mockImplementation(
      routeApiPost({ login: () => Promise.resolve(MFA_REQUIRED), challenge }) as typeof apiPost,
    );

    render(
      <Providers>
        <LoginForm dict={dict} />
      </Providers>,
    );
    await submitCredentials();

    await screen.findByLabelText(dict.mfaCodeLabel);
    const submit = screen.getByRole('button', { name: dict.mfaSubmit });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText(dict.mfaCodeLabel), { target: { value: '123' } });
    expect(submit).toBeDisabled();
    fireEvent.click(submit);
    expect(challenge).not.toHaveBeenCalled();
  });
});
