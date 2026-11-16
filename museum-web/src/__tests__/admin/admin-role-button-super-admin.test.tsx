import { Suspense, useEffect, useMemo } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

import { AuthProvider, useAuth } from '@/lib/auth';
import { AdminDictProvider } from '@/lib/admin-dictionary';
import UserDetailPage from '@/app/[locale]/admin/users/[id]/page';
import UsersPage from '@/app/[locale]/admin/users/page';
import { mockAdminDict } from '@/__tests__/helpers/admin-dict.fixture';
import { makeAdminUser } from '@/__tests__/helpers/admin-user.fixture';
import type { UserRole } from '@/lib/admin-types';
import type * as ApiModule from '@/lib/api';

vi.mock('next/navigation', () => ({
  usePathname: () => '/en/admin/users',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
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

const { mockApiGet, mockApiPost } = vi.hoisted(() => ({
  mockApiGet: vi.fn(),
  mockApiPost: vi.fn(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  apiGet: mockApiGet,
  apiPost: mockApiPost,
  apiPatch: vi.fn(),
  apiDelete: vi.fn(),
  registerLogoutHandler: vi.fn(),
}));

const loginAs = (role: UserRole) => {
  mockApiPost.mockResolvedValueOnce({
    accessToken: 'at',
    refreshToken: 'rt',
    expiresIn: 900,
    refreshExpiresIn: 86400,
    user: {
      id: 1,
      email: 'viewer@test.com',
      firstname: 'Viewer',
      lastname: 'Account',
      role,
      onboardingCompleted: true,
    },
  });
};

function Authenticated({ children }: { children: React.ReactNode }) {
  const { login, isAuthenticated } = useAuth();
  useEffect(() => {
    if (!isAuthenticated) {
      void login('viewer@test.com', 'pass');
    }
  }, [isAuthenticated, login]);
  return isAuthenticated ? children : <div>Logging in…</div>;
}

function DetailOf() {
  const params = useMemo(() => Promise.resolve({ locale: 'en', id: '42' }), []);
  return <UserDetailPage params={params} />;
}

const renderAs = (role: UserRole, page: React.ReactNode) => {
  loginAs(role);
  render(
    <AdminDictProvider dict={mockAdminDict} locale="en">
      <AuthProvider>
        <Suspense fallback={<div>Loading…</div>}>
          <Authenticated>{page}</Authenticated>
        </Suspense>
      </AuthProvider>
    </AdminDictProvider>,
  );
};

const owner = makeAdminUser({
  id: 42,
  email: 'owner@test.com',
  firstname: 'Owner',
  lastname: 'Account',
  role: 'super_admin',
});

describe('BOUTON-ROLE-SUPER-ADMIN', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.cookie = 'admin-authz=; Path=/; Max-Age=0; SameSite=Lax';
  });

  it('BOUTON-ROLE-SUPER-ADMIN · sur la fiche d’un super_admin, un admin ne voit pas « Change role »', async () => {
    mockApiGet.mockResolvedValueOnce({ user: owner });
    renderAs('admin', <DetailOf />);

    await screen.findByRole('heading', { level: 1, name: 'Owner Account' });
    expect(screen.queryByRole('button', { name: 'Change role' })).not.toBeInTheDocument();
  });

  it('BOUTON-ROLE-SUPER-ADMIN · sur la fiche d’un super_admin, un super_admin voit « Change role »', async () => {
    mockApiGet.mockResolvedValueOnce({ user: owner });
    renderAs('super_admin', <DetailOf />);

    await screen.findByRole('heading', { level: 1, name: 'Owner Account' });
    expect(screen.getByRole('button', { name: 'Change role' })).toBeInTheDocument();
  });

  it('BOUTON-ROLE-SUPER-ADMIN · sur la fiche d’un admin, un admin voit « Change role »', async () => {
    mockApiGet.mockResolvedValueOnce({ user: { ...owner, role: 'admin' } });
    renderAs('admin', <DetailOf />);

    await screen.findByRole('heading', { level: 1, name: 'Owner Account' });
    expect(screen.getByRole('button', { name: 'Change role' })).toBeInTheDocument();
  });

  it('BOUTON-ROLE-SUPER-ADMIN · dans la liste, un admin n’a « Change role » que sur les lignes qui ne sont pas super_admin', async () => {
    mockApiGet.mockResolvedValueOnce({
      data: [owner, makeAdminUser({ id: 7, email: 'visitor@test.com', firstname: 'Visitor' })],
      page: 1,
      limit: 10,
      total: 2,
      totalPages: 1,
    });
    renderAs('admin', <UsersPage />);

    await waitFor(() => {
      expect(screen.getByText('owner@test.com')).toBeInTheDocument();
    });
    expect(screen.getAllByRole('button', { name: 'Change Role' })).toHaveLength(1);
  });

  it('BOUTON-ROLE-SUPER-ADMIN · dans la liste, un super_admin a « Change role » sur chaque ligne', async () => {
    mockApiGet.mockResolvedValueOnce({
      data: [owner, makeAdminUser({ id: 7, email: 'visitor@test.com', firstname: 'Visitor' })],
      page: 1,
      limit: 10,
      total: 2,
      totalPages: 1,
    });
    renderAs('super_admin', <UsersPage />);

    await waitFor(() => {
      expect(screen.getByText('owner@test.com')).toBeInTheDocument();
    });
    expect(screen.getAllByRole('button', { name: 'Change Role' })).toHaveLength(2);
  });
});
