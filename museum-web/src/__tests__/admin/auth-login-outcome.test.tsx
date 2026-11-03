import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '@/lib/auth';
import { AdminDictProvider } from '@/lib/admin-dictionary';
import { ApiError } from '@/lib/api';
import type * as ApiModule from '@/lib/api';
import { mockAdminDict } from '@/__tests__/helpers/admin-dict.fixture';

vi.mock('next/navigation', () => ({
  usePathname: () => '/en/admin',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
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

function Probe() {
  const { login, user } = useAuth();
  return (
    <div>
      <button
        onClick={() => {
          void login('admin@test.com', 'pw').catch((e: unknown) => {
            document.body.setAttribute(
              'data-threw',
              e instanceof ApiError ? `ApiError:${e.status}` : 'Error',
            );
          });
        }}
      >
        Login
      </button>
      <span data-testid="user-email">{user?.email ?? 'none'}</span>
    </div>
  );
}

describe('auth.tsx login()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.removeAttribute('data-threw');
    document.cookie = 'admin-authz=; Path=/; Max-Age=0';
  });

  it('a session sets the admin-authz cookie and the signed-in user', async () => {
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
      expect(screen.getByTestId('user-email')).toHaveTextContent('admin@test.com');
    });
    expect(document.cookie).toContain('admin-authz=1');
  });

  it('a refused login (403 ACCOUNT_SUSPENDED) throws and signs nobody in', async () => {
    const { apiPost } = await import('@/lib/api');
    vi.mocked(apiPost).mockRejectedValueOnce(new ApiError(403, 'Forbidden', 'Account suspended'));

    render(
      <Providers>
        <Probe />
      </Providers>,
    );
    fireEvent.click(screen.getByText('Login'));

    await waitFor(() => {
      expect(document.body.getAttribute('data-threw')).toBe('ApiError:403');
    });
    expect(screen.getByTestId('user-email')).toHaveTextContent('none');
    expect(document.cookie).not.toContain('admin-authz=1');
  });
});
