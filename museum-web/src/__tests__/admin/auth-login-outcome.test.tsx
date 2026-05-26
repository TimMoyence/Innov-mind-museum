/**
 * T4.1 RED — `login()` returns a discriminated LoginOutcome (D1/D5), never
 * crashes on the MFA `/login` envelopes.
 *
 * Today `auth.tsx login()` reads `data.user` blindly (`auth.tsx:169`). When the
 * backend returns a `MfaRequiredResponse` (no `user`) it throws
 * `Cannot read properties of undefined`, and an enrollment-required 403 is an
 * opaque ApiError. This suite pins the four branches BEFORE the impl:
 *   (a) AuthSessionResponse → resolves { kind: 'success' } + sets admin-authz cookie.
 *   (b) MfaRequiredResponse → resolves { kind:'mfa-required', token, expiresIn },
 *       does NOT crash, does NOT set `user`.
 *   (c) ApiError(403, body={mfaEnrollmentRequired:true,...}) → { kind:'enrollment-required' }.
 *   (d) ApiError(403, body={error:{code:'ACCOUNT_SUSPENDED'}}) → THROWS (not enrollment).
 *
 * MUST FAIL today: `login()` returns `Promise<void>` and throws on (b)/(c).
 *
 * All assertions are on OBSERVABLE state (the resolved outcome value,
 * document.cookie, useAuth().user) — never component internals.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '@/lib/auth';
import { AdminDictProvider } from '@/lib/admin-dictionary';
import { ApiError } from '@/lib/api';
import type * as ApiModule from '@/lib/api';
import { mockAdminDict } from '@/__tests__/helpers/admin-dict.fixture';

const mockPush = vi.fn();
const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => '/en/admin',
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => new URLSearchParams(),
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

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AdminDictProvider dict={mockAdminDict} locale="en">
      <AuthProvider>{children}</AuthProvider>
    </AdminDictProvider>
  );
}

/**
 * Probe component: calls `login()`, captures the resolved outcome (or thrown
 * error) into the DOM so the test reads observable text only.
 */
function Probe() {
  const { login, user } = useAuth();
  // `login()` will (post-T4.2) resolve a discriminated `LoginOutcome`. We view
  // it structurally as `Promise<unknown>` so this RED test compiles BEFORE the
  // impl (today `login` is typed `Promise<void>`). At runtime today it resolves
  // `undefined` → the `data-outcome` assertions fail BEHAVIOURALLY.
  const loginV2 = login as unknown as (email: string, password: string) => Promise<unknown>;
  return (
    <div>
      <button
        onClick={() => {
          void (async () => {
            try {
              const outcome = await loginV2('admin@test.com', 'pw');
              document.body.setAttribute('data-outcome', JSON.stringify(outcome));
            } catch (e) {
              document.body.setAttribute(
                'data-threw',
                e instanceof ApiError ? `ApiError:${e.status}` : 'Error',
              );
            }
          })();
        }}
      >
        Login
      </button>
      <span data-testid="user-email">{user?.email ?? 'none'}</span>
    </div>
  );
}

describe('auth.tsx login() — discriminated LoginOutcome (R1/R2/R7, D5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.removeAttribute('data-outcome');
    document.body.removeAttribute('data-threw');
    document.cookie = 'admin-authz=; Path=/; Max-Age=0';
  });

  it('(a) AuthSessionResponse → { kind: "success" } and sets admin-authz cookie', async () => {
    const { apiPost } = await import('@/lib/api');
    vi.mocked(apiPost).mockResolvedValueOnce({
      accessToken: 'at',
      refreshToken: 'rt',
      expiresIn: 900,
      refreshExpiresIn: 86400,
      user: {
        id: 1,
        email: 'admin@test.com',
        firstname: 'Admin',
        lastname: null,
        role: 'admin',
        onboardingCompleted: true,
      },
    });

    render(
      <Providers>
        <Probe />
      </Providers>,
    );
    fireEvent.click(screen.getByText('Login'));

    await waitFor(() => {
      expect(document.body.getAttribute('data-outcome')).toBe(JSON.stringify({ kind: 'success' }));
    });
    expect(document.cookie).toContain('admin-authz=1');
    expect(screen.getByTestId('user-email')).toHaveTextContent('admin@test.com');
  });

  it('(b) MfaRequiredResponse → { kind: "mfa-required", ... } without crashing or setting user', async () => {
    const { apiPost } = await import('@/lib/api');
    vi.mocked(apiPost).mockResolvedValueOnce({
      mfaRequired: true,
      mfaSessionToken: 'mfa-sess-xyz',
      mfaSessionExpiresIn: 300,
    });

    render(
      <Providers>
        <Probe />
      </Providers>,
    );
    fireEvent.click(screen.getByText('Login'));

    await waitFor(() => {
      expect(document.body.getAttribute('data-outcome')).toBe(
        JSON.stringify({
          kind: 'mfa-required',
          mfaSessionToken: 'mfa-sess-xyz',
          mfaSessionExpiresIn: 300,
        }),
      );
    });
    // No crash captured, and no user was established.
    expect(document.body.getAttribute('data-threw')).toBeNull();
    expect(screen.getByTestId('user-email')).toHaveTextContent('none');
  });

  it('(c) ApiError 403 with mfaEnrollmentRequired body → { kind: "enrollment-required" }', async () => {
    const { apiPost } = await import('@/lib/api');
    const err = new ApiError(403, 'Forbidden', 'MFA enrollment required');
    (err as ApiError & { body: unknown }).body = {
      mfaEnrollmentRequired: true,
      redirectTo: '/admin/mfa',
    };
    vi.mocked(apiPost).mockRejectedValueOnce(err);

    render(
      <Providers>
        <Probe />
      </Providers>,
    );
    fireEvent.click(screen.getByText('Login'));

    await waitFor(() => {
      expect(document.body.getAttribute('data-outcome')).toBe(
        JSON.stringify({ kind: 'enrollment-required' }),
      );
    });
    expect(document.body.getAttribute('data-threw')).toBeNull();
  });

  it('(d) ApiError 403 with a NON-MFA error body (ACCOUNT_SUSPENDED) → login() THROWS', async () => {
    const { apiPost } = await import('@/lib/api');
    const err = new ApiError(403, 'Forbidden', 'Account suspended');
    (err as ApiError & { body: unknown }).body = {
      error: { code: 'ACCOUNT_SUSPENDED', message: 'Account suspended' },
    };
    vi.mocked(apiPost).mockRejectedValueOnce(err);

    render(
      <Providers>
        <Probe />
      </Providers>,
    );
    fireEvent.click(screen.getByText('Login'));

    await waitFor(() => {
      expect(document.body.getAttribute('data-threw')).toBe('ApiError:403');
    });
    // It must NOT have been swallowed into an enrollment outcome.
    expect(document.body.getAttribute('data-outcome')).toBeNull();
  });
});
