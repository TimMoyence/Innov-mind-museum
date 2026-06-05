/**
 * M1b RED — recovery-code login low-count warning must be surfaced (R6, review finding I1).
 *
 * Drives the real <LoginForm> through the real <AuthProvider> with `@/lib/api`
 * mocked per-branch and `next/navigation` mocked. Every assertion is on
 * OBSERVABLE DOM / router state — never on component internals.
 *
 * Review finding I1: on a successful /mfa/recovery, LoginForm currently calls
 * setRemainingMessage(...) and then finishWithSession() which immediately runs
 * router.push(`/${locale}/admin`). The "N codes remaining" warning is therefore
 * unmounted before the admin can read it — R6 ("surface remainingRecoveryCodes,
 * warn when low") is NOT actually met in prod.
 *
 * MUST FAIL today: after a recovery success the impl pushes immediately, so
 *   (a) mockPush is called before any Continue interaction,
 *   (c) no "Continue to admin" button (dict.mfaRecoveryContinue) is rendered,
 *   (d) so the click-then-push step can never run.
 * Assertion (b) (the count is shown) may transiently pass on its own but the
 * surrounding flow fails the test as a whole.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthProvider } from '@/lib/auth';
import { AdminDictProvider } from '@/lib/admin-dictionary';
import LoginForm from '@/components/admin/LoginForm';
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

/** Drives credentials -> challenge -> recovery toggle -> submit a recovery code. */
async function submitRecoveryCode() {
  await submitCredentials();
  await screen.findByLabelText(dict.mfaCodeLabel);
  fireEvent.click(screen.getByRole('button', { name: dict.mfaUseRecovery }));
  const recoveryInput = await screen.findByLabelText(dict.mfaRecoveryLabel);
  fireEvent.change(recoveryInput, { target: { value: 'TEST00-CODE00' } });
  fireEvent.click(screen.getByRole('button', { name: dict.mfaRecoverySubmit }));
}

describe('LoginForm — recovery remaining-codes warning (R6 / I1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.cookie = 'admin-authz=; Path=/; Max-Age=0';
  });

  it('R6/I1 — a successful recovery login surfaces the low remaining count and waits for an explicit Continue before navigating', async () => {
    const { apiPost } = await import('@/lib/api');
    vi.mocked(apiPost).mockImplementation(
      routeApiPost({
        login: () => Promise.resolve(MFA_REQUIRED),
        recovery: () => Promise.resolve({ ...SUCCESS_SESSION, remainingRecoveryCodes: 2 }),
      }) as typeof apiPost,
    );

    render(
      <Providers>
        <LoginForm dict={dict} />
      </Providers>,
    );

    await submitRecoveryCode();

    // The recovery call landed.
    await waitFor(() => {
      expect(vi.mocked(apiPost)).toHaveBeenCalledWith(
        '/api/auth/mfa/recovery',
        { mfaSessionToken: 'mfa-sess-xyz', recoveryCode: 'TEST00-CODE00' },
        expect.objectContaining({ skipAuthRefresh: true }),
      );
    });

    // (b) The low remaining-codes count (2) is surfaced to the admin...
    await waitFor(() => {
      expect(screen.getByText(/2/)).toBeInTheDocument();
    });

    // (a) ...and we did NOT navigate away (which would unmount the warning).
    expect(mockPush).not.toHaveBeenCalled();

    // (c) An explicit "Continue to admin" affordance is offered.
    const continueButton = screen.getByRole('button', { name: dict.mfaRecoveryContinue });
    expect(continueButton).toBeInTheDocument();

    // (d) Only after the admin acknowledges does navigation happen.
    fireEvent.click(continueButton);
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/en/admin');
    });
  });
});
