import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '@/lib/auth';
import { AdminDictProvider } from '@/lib/admin-dictionary';
import UsersPage from '@/app/[locale]/admin/users/page';
import { mockAdminDict } from '@/__tests__/helpers/admin-dict.fixture';
import { requireIndex } from '@/__tests__/helpers/require-index';
import type { PaginatedResponse, AdminUserDTO } from '@/lib/admin-types';

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

const mockApiGet = vi.fn();
const mockApiPatch = vi.fn();
const mockApiPost = vi.fn();

vi.mock('@/lib/api', () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args) as Promise<unknown>,
  apiPatch: (...args: unknown[]) => mockApiPatch(...args) as Promise<unknown>,
  apiPost: (...args: unknown[]) => mockApiPost(...args) as Promise<unknown>,
  registerLogoutHandler: vi.fn(),
}));

function makeUser(overrides: Partial<AdminUserDTO> = {}): AdminUserDTO {
  return {
    id: 1,
    email: 'alice@test.com',
    firstname: 'Alice',
    lastname: 'Martin',
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

const mockUsersPage1: PaginatedResponse<AdminUserDTO> = {
  data: [
    makeUser({
      id: 1,
      firstname: 'Alice',
      lastname: 'Martin',
      email: 'alice@test.com',
      role: 'visitor',
    }),
    makeUser({ id: 2, firstname: 'Bob', lastname: 'Dupont', email: 'bob@test.com', role: 'admin' }),
    makeUser({
      id: 3,
      firstname: 'Charlie',
      lastname: 'Renard',
      email: 'charlie@test.com',
      role: 'moderator',
    }),
  ],
  page: 1,
  limit: 10,
  total: 25,
  totalPages: 3,
};

function AuthenticatedUsersPage() {
  const { login, isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    void login('admin@test.com', 'pass');
  }

  return isAuthenticated ? <UsersPage /> : <div>Logging in...</div>;
}

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AdminDictProvider dict={mockAdminDict} locale="en">
      <AuthProvider>{children}</AuthProvider>
    </AdminDictProvider>
  );
}

describe('UsersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    document.cookie = 'admin-authz=; Path=/; Max-Age=0; SameSite=Lax';

    mockApiPost.mockResolvedValue({
      accessToken: 'at',
      refreshToken: 'rt',
      expiresIn: 900,
      refreshExpiresIn: 86400,
      user: {
        id: 99,
        email: 'admin@test.com',
        firstname: 'Super',
        lastname: 'Admin',
        role: 'admin',
        onboardingCompleted: true,
      },
    });
  });

  it('renders the users heading', async () => {
    mockApiGet.mockResolvedValueOnce(mockUsersPage1);

    render(
      <Providers>
        <AuthenticatedUsersPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Users' })).toBeInTheDocument();
    });
  });

  it('renders user list with names and emails', async () => {
    mockApiGet.mockResolvedValueOnce(mockUsersPage1);

    render(
      <Providers>
        <AuthenticatedUsersPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('Alice Martin')).toBeInTheDocument();
    });

    expect(screen.getByText('alice@test.com')).toBeInTheDocument();
    expect(screen.getByText('Bob Dupont')).toBeInTheDocument();
    expect(screen.getByText('bob@test.com')).toBeInTheDocument();
    expect(screen.getByText('Charlie Renard')).toBeInTheDocument();
  });

  it('renders role badges for each user', async () => {
    mockApiGet.mockResolvedValueOnce(mockUsersPage1);

    render(
      <Providers>
        <AuthenticatedUsersPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('Alice Martin')).toBeInTheDocument();
    });

    expect(screen.getAllByText('visitor').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('admin').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('moderator').length).toBeGreaterThanOrEqual(1);
  });

  it('shows search input and role filter', async () => {
    mockApiGet.mockResolvedValueOnce(mockUsersPage1);

    render(
      <Providers>
        <AuthenticatedUsersPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument();
    });

    expect(screen.getByDisplayValue('All roles')).toBeInTheDocument();
  });

  it('renders pagination when totalPages > 1', async () => {
    mockApiGet.mockResolvedValueOnce(mockUsersPage1);

    render(
      <Providers>
        <AuthenticatedUsersPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('Alice Martin')).toBeInTheDocument();
    });

    expect(screen.getByText('Previous')).toBeInTheDocument();
    expect(screen.getByText('Next')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 3 (25 total)')).toBeInTheDocument();
  });

  it('previous button is disabled on first page', async () => {
    mockApiGet.mockResolvedValueOnce(mockUsersPage1);

    render(
      <Providers>
        <AuthenticatedUsersPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('Alice Martin')).toBeInTheDocument();
    });

    expect(screen.getByText('Previous')).toBeDisabled();
    expect(screen.getByText('Next')).not.toBeDisabled();
  });

  it('renders Change Role button for admin users', async () => {
    mockApiGet.mockResolvedValueOnce(mockUsersPage1);

    render(
      <Providers>
        <AuthenticatedUsersPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('Alice Martin')).toBeInTheDocument();
    });

    const changeRoleButtons = screen.getAllByText('Change Role');
    expect(changeRoleButtons.length).toBe(3);
  });

  it('opens role change modal on click', async () => {
    mockApiGet.mockResolvedValueOnce(mockUsersPage1);

    render(
      <Providers>
        <AuthenticatedUsersPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('Alice Martin')).toBeInTheDocument();
    });

    const changeRoleButtons = screen.getAllByText('Change Role');
    fireEvent.click(requireIndex(changeRoleButtons, 0, 'changeRoleButtons'));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    expect(screen.getByText('Alice Martin (alice@test.com)')).toBeInTheDocument();

    expect(screen.getByText('Confirm')).toBeDisabled();
  });

  it('handles API error when loading users', async () => {
    mockApiGet.mockRejectedValueOnce(new Error('Server error'));

    render(
      <Providers>
        <AuthenticatedUsersPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument();
    });
  });

  it('shows empty state when no users found', async () => {
    mockApiGet.mockResolvedValueOnce({
      data: [],
      page: 1,
      limit: 10,
      total: 0,
      totalPages: 0,
    });

    render(
      <Providers>
        <AuthenticatedUsersPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('No users found.')).toBeInTheDocument();
    });
  });

  it('calls API with search parameter when searching', async () => {
    mockApiGet.mockResolvedValueOnce(mockUsersPage1);

    render(
      <Providers>
        <AuthenticatedUsersPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('Alice Martin')).toBeInTheDocument();
    });

    mockApiGet.mockResolvedValueOnce({
      data: [makeUser({ id: 1, firstname: 'Alice', lastname: 'Martin', email: 'alice@test.com' })],
      page: 1,
      limit: 10,
      total: 1,
      totalPages: 1,
    });

    fireEvent.change(screen.getByPlaceholderText('Search...'), {
      target: { value: 'alice' },
    });

    await waitFor(
      () => {
        const lastCall = mockApiGet.mock.calls.at(-1)?.[0] as string;
        expect(lastCall).toContain('search=alice');
      },
      { timeout: 1000 },
    );
  });
});
