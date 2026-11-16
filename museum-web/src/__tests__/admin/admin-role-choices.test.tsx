import { Suspense, useEffect, useMemo } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

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

const EVERY_ROLE = ['visitor', 'moderator', 'museum_manager', 'admin', 'super_admin'];
const WITHOUT_SUPER_ADMIN = ['visitor', 'moderator', 'museum_manager', 'admin'];

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
  mockApiPost.mockResolvedValueOnce({
    accessToken: 'at',
    refreshToken: 'rt',
    expiresIn: 900,
    refreshExpiresIn: 86400,
    user: { id: 1, email: 'viewer@test.com', role, onboardingCompleted: true },
  });
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

const visitor = makeAdminUser({
  id: 42,
  email: 'visitor@test.com',
  firstname: 'Visiting',
  lastname: 'Person',
});

const listOf = () => ({ data: [visitor], page: 1, limit: 10, total: 1, totalPages: 1 });

const optionsOf = (select: HTMLElement): string[] =>
  within(select)
    .getAllByRole('option')
    .map((option) => (option as HTMLOptionElement).value);

const detailRoleChoices = async (viewer: UserRole): Promise<string[]> => {
  mockApiGet.mockResolvedValueOnce({ user: visitor });
  renderAs(viewer, <DetailOf />);
  fireEvent.click(await screen.findByRole('button', { name: 'Change role' }));
  return optionsOf(screen.getByLabelText('New role'));
};

const listRoleChoices = async (viewer: UserRole): Promise<string[]> => {
  mockApiGet.mockResolvedValue(listOf());
  renderAs(viewer, <UsersPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Change Role' }));
  const dialog = await screen.findByRole('dialog');
  return optionsOf(within(dialog).getByRole('combobox', { name: 'Change Role' }));
};

describe('ROLES-WEB', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiGet.mockReset();
    document.cookie = 'admin-authz=; Path=/; Max-Age=0; SameSite=Lax';
  });

  it('ROLES-WEB · sur la fiche, un super_admin peut choisir chacun des cinq rôles', async () => {
    expect(await detailRoleChoices('super_admin')).toEqual(EVERY_ROLE);
  });

  it('ROLES-WEB · sur la fiche, un admin choisit parmi les quatre rôles, sans super_admin', async () => {
    expect(await detailRoleChoices('admin')).toEqual(WITHOUT_SUPER_ADMIN);
  });

  it('ROLES-WEB · dans la liste, un super_admin peut choisir chacun des cinq rôles', async () => {
    expect(await listRoleChoices('super_admin')).toEqual(EVERY_ROLE);
  });

  it('ROLES-WEB · dans la liste, un admin choisit parmi les quatre rôles, sans super_admin', async () => {
    expect(await listRoleChoices('admin')).toEqual(WITHOUT_SUPER_ADMIN);
  });

  it('ROLES-WEB · le filtre Rôle de la liste propose « All roles » puis les cinq rôles', async () => {
    mockApiGet.mockResolvedValue(listOf());
    renderAs('admin', <UsersPage />);

    const filter = await screen.findByRole('combobox', { name: 'Role' });
    expect(optionsOf(filter)).toEqual(['', ...EVERY_ROLE]);
  });
});
