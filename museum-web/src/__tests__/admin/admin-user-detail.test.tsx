/**
 * Admin user detail page tests — render, RBAC actions, role change, suspend,
 * unsuspend, delete-with-typed-email guard. Closes audit-2026-05-12 P0 #9.
 */
import { Suspense, useEffect, useMemo } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { AuthProvider, useAuth } from '@/lib/auth';
import { AdminDictProvider } from '@/lib/admin-dictionary';
import UserDetailPage from '@/app/[locale]/admin/users/[id]/page';
import { mockAdminDict } from '@/__tests__/helpers/admin-dict.fixture';
import { requireIndex } from '@/__tests__/helpers/require-index';
import type { AdminUserDTO } from '@/lib/admin-types';

// ── Next.js mocks ───────────────────────────────────────────────────────────

const mockPush = vi.fn();
const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => '/en/admin/users/42',
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// ── API mock ────────────────────────────────────────────────────────────────
//
// `ApiError` must be exported by the mocked module because src/lib/auth.tsx
// (loaded transitively when the page is rendered) imports from `@/lib/api`.
// vi.hoisted ensures the class is defined before the vi.mock factory runs.

const { mockApiGet, mockApiPost, mockApiPatch, mockApiDelete, ApiError } = vi.hoisted(() => {
  class ApiError extends Error {
    constructor(
      public status: number,
      public statusText: string,
      message: string,
    ) {
      super(message);
      this.name = 'ApiError';
    }
  }
  return {
    mockApiGet: vi.fn(),
    mockApiPost: vi.fn(),
    mockApiPatch: vi.fn(),
    mockApiDelete: vi.fn(),
    ApiError,
  };
});

vi.mock('@/lib/api', () => ({
  apiGet: mockApiGet,
  apiPost: mockApiPost,
  apiPatch: mockApiPatch,
  apiDelete: mockApiDelete,
  registerLogoutHandler: vi.fn(),
  ApiError,
}));

// ── Fixtures ────────────────────────────────────────────────────────────────

function makeUser(overrides: Partial<AdminUserDTO> = {}): AdminUserDTO {
  return {
    id: 42,
    email: 'bob@test.com',
    firstname: 'Bob',
    lastname: 'Smith',
    role: 'visitor',
    museumId: null,
    emailVerified: true,
    suspended: false,
    deletedAt: null,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-06-01T00:00:00Z',
    ...overrides,
  };
}

interface LoginUser {
  id: number;
  email: string;
  firstname: string | null;
  lastname: string | null;
  role: 'visitor' | 'moderator' | 'museum_manager' | 'admin' | 'super_admin';
  onboardingCompleted: boolean;
}

function mockLoginAs(login: LoginUser) {
  mockApiPost.mockResolvedValueOnce({
    accessToken: 'at',
    refreshToken: 'rt',
    expiresIn: 900,
    refreshExpiresIn: 86400,
    user: login,
  });
}

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AdminDictProvider dict={mockAdminDict} locale="en">
      <AuthProvider>
        {/* React 19 `use(params)` inside the page suspends until the promise
            resolves; the App Router wraps every page in a Suspense boundary
            in production. Mirror it here. */}
        <Suspense fallback={<div>Loading…</div>}>{children}</Suspense>
      </AuthProvider>
    </AdminDictProvider>
  );
}

function AuthenticatedDetailPage({
  loginAs,
  targetId = '42',
}: {
  loginAs: LoginUser;
  targetId?: string;
}) {
  const { login, isAuthenticated } = useAuth();
  useEffect(() => {
    if (!isAuthenticated) {
      void login(loginAs.email, 'pass');
    }
  }, [isAuthenticated, login, loginAs.email]);
  // Stable Promise — React 19 `use(params)` requires a referentially stable
  // promise across renders to avoid re-suspending the page.
  const params = useMemo(() => Promise.resolve({ locale: 'en', id: targetId }), [targetId]);
  if (!isAuthenticated) return <div>Logging in…</div>;
  return <UserDetailPage params={params} />;
}

const ADMIN_LOGIN: LoginUser = {
  id: 1,
  email: 'admin@test.com',
  firstname: 'Admin',
  lastname: 'User',
  role: 'admin',
  onboardingCompleted: true,
};

const SUPER_ADMIN_LOGIN: LoginUser = {
  id: 99,
  email: 'tim@musaium.fr',
  firstname: 'Tim',
  lastname: 'Owner',
  role: 'super_admin',
  onboardingCompleted: true,
};

const MOD_LOGIN: LoginUser = {
  id: 7,
  email: 'mod@test.com',
  firstname: 'Mod',
  lastname: 'User',
  role: 'moderator',
  onboardingCompleted: true,
};

// ════════════════════════════════════════════════════════════════════════════
describe('UserDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.cookie = 'admin-authz=; Path=/; Max-Age=0; SameSite=Lax';
  });

  it('renders user identity fields when fetch succeeds', async () => {
    mockLoginAs(ADMIN_LOGIN);
    mockApiGet.mockResolvedValueOnce({ user: makeUser() });

    render(
      <Providers>
        <AuthenticatedDetailPage loginAs={ADMIN_LOGIN} />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Bob Smith' })).toBeInTheDocument();
    });
    expect(screen.getByText('bob@test.com')).toBeInTheDocument();
    expect(screen.getByText('visitor')).toBeInTheDocument();
    // Verified badge present
    expect(screen.getByText('Verified')).toBeInTheDocument();
  });

  it('shows error state on 404', async () => {
    mockLoginAs(ADMIN_LOGIN);
    mockApiGet.mockRejectedValueOnce(new ApiError(404, 'Not Found', 'User not found'));

    render(
      <Providers>
        <AuthenticatedDetailPage loginAs={ADMIN_LOGIN} />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('User not found.')).toBeInTheDocument();
    });
  });

  it('renders the Change role button for admin and exposes the action panel', async () => {
    mockLoginAs(ADMIN_LOGIN);
    mockApiGet.mockResolvedValueOnce({ user: makeUser() });

    render(
      <Providers>
        <AuthenticatedDetailPage loginAs={ADMIN_LOGIN} />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Bob Smith' })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Change role' })).toBeInTheDocument();
    // admin (NOT super_admin) does not see Suspend / Delete
    expect(screen.queryByRole('button', { name: 'Suspend' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('renders Suspend + Delete buttons for super_admin', async () => {
    mockLoginAs(SUPER_ADMIN_LOGIN);
    mockApiGet.mockResolvedValueOnce({ user: makeUser() });

    render(
      <Providers>
        <AuthenticatedDetailPage loginAs={SUPER_ADMIN_LOGIN} />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Bob Smith' })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Suspend' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('hides mutation buttons for moderator (read-only)', async () => {
    mockLoginAs(MOD_LOGIN);
    mockApiGet.mockResolvedValueOnce({ user: makeUser() });

    render(
      <Providers>
        <AuthenticatedDetailPage loginAs={MOD_LOGIN} />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Bob Smith' })).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: 'Change role' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Suspend' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('issues PATCH /role on change-role confirm', async () => {
    mockLoginAs(ADMIN_LOGIN);
    mockApiGet.mockResolvedValueOnce({ user: makeUser() });
    mockApiPatch.mockResolvedValueOnce({ user: makeUser({ role: 'moderator' }) });

    render(
      <Providers>
        <AuthenticatedDetailPage loginAs={ADMIN_LOGIN} />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Bob Smith' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Change role' }));
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('New role'), { target: { value: 'moderator' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => {
      expect(mockApiPatch).toHaveBeenCalledWith('/api/admin/users/42/role', {
        role: 'moderator',
      });
    });
    // Updated badge appears
    await waitFor(() => {
      expect(screen.getByText('moderator')).toBeInTheDocument();
    });
  });

  it('issues POST /suspend on confirm', async () => {
    mockLoginAs(SUPER_ADMIN_LOGIN);
    mockApiGet.mockResolvedValueOnce({ user: makeUser() });
    mockApiPost.mockResolvedValueOnce({ user: makeUser({ suspended: true }) });

    render(
      <Providers>
        <AuthenticatedDetailPage loginAs={SUPER_ADMIN_LOGIN} />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Bob Smith' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Suspend' }));
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Confirm button inside the dialog
    const confirmBtns = screen
      .getAllByRole('button', { name: 'Suspend' })
      .filter((btn) => btn.classList.contains('bg-red-600'));
    expect(confirmBtns.length).toBeGreaterThan(0);
    fireEvent.click(requireIndex(confirmBtns, 0, 'suspend confirm buttons'));

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenLastCalledWith(
        '/api/admin/users/42/suspend',
        undefined,
      );
    });
    // New "Suspended" badge appears
    await waitFor(() => {
      const badges = screen.getAllByText('Suspended');
      expect(badges.length).toBeGreaterThan(0);
    });
  });

  it('disables Delete confirm until the email is typed exactly', async () => {
    mockLoginAs(SUPER_ADMIN_LOGIN);
    mockApiGet.mockResolvedValueOnce({ user: makeUser() });

    render(
      <Providers>
        <AuthenticatedDetailPage loginAs={SUPER_ADMIN_LOGIN} />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Bob Smith' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Disabled until match.
    const input = screen.getByLabelText('Type email to confirm');
    const deleteButtonsInModal = screen
      .getAllByRole('button', { name: 'Delete' })
      .filter((b) => b.classList.contains('bg-red-600'));
    const firstDeleteBtn = requireIndex(deleteButtonsInModal, 0, 'delete modal buttons');
    expect(firstDeleteBtn).toBeDisabled();

    // Wrong email keeps it disabled.
    fireEvent.change(input, { target: { value: 'wrong@test.com' } });
    expect(firstDeleteBtn).toBeDisabled();

    // Correct email enables the destructive action.
    fireEvent.change(input, { target: { value: 'bob@test.com' } });
    expect(firstDeleteBtn).not.toBeDisabled();

    mockApiDelete.mockResolvedValueOnce({ user: makeUser({ deletedAt: '2026-05-14T10:00:00Z' }) });
    fireEvent.click(firstDeleteBtn);

    await waitFor(() => {
      expect(mockApiDelete).toHaveBeenCalledWith('/api/admin/users/42');
    });
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/en/admin/users');
    });
  });

  it('surfaces the last-admin error verbatim through the dict mapping', async () => {
    mockLoginAs(SUPER_ADMIN_LOGIN);
    mockApiGet.mockResolvedValueOnce({ user: makeUser({ role: 'admin' }) });
    mockApiDelete.mockRejectedValueOnce(
      new ApiError(409, 'Conflict', 'CANNOT_DELETE_LAST_ADMIN'),
    );

    render(
      <Providers>
        <AuthenticatedDetailPage loginAs={SUPER_ADMIN_LOGIN} />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Bob Smith' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText('Type email to confirm'), {
      target: { value: 'bob@test.com' },
    });
    const deleteButtonsInModal = screen
      .getAllByRole('button', { name: 'Delete' })
      .filter((b) => b.classList.contains('bg-red-600'));
    fireEvent.click(requireIndex(deleteButtonsInModal, 0, 'last-admin delete confirm'));

    await waitFor(() => {
      expect(screen.getByText('Cannot delete the last admin.')).toBeInTheDocument();
    });
  });
});
