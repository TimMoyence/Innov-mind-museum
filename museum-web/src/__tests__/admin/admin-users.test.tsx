/**
 * Admin users page tests — user list, role change, pagination.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '@/lib/auth';
import { AdminDictProvider } from '@/lib/admin-dictionary';
import UsersPage from '@/app/[locale]/admin/users/page';
import { mockAdminDict } from '@/__tests__/helpers/admin-dict.fixture';
import type { PaginatedResponse, AdminUserDTO } from '@/lib/admin-types';

// ── Next.js mocks ───────────────────────────────────────────────────────────

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

// ── API mock ────────────────────────────────────────────────────────────────

const mockApiGet = vi.fn();
const mockApiPatch = vi.fn();
const mockApiPost = vi.fn();

vi.mock('@/lib/api', () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args) as Promise<unknown>,
  apiPatch: (...args: unknown[]) => mockApiPatch(...args) as Promise<unknown>,
  apiPost: (...args: unknown[]) => mockApiPost(...args) as Promise<unknown>,
  setTokens: vi.fn(),
  clearTokens: vi.fn(),
  registerLogoutHandler: vi.fn(),
}));

// ── Test data ───────────────────────────────────────────────────────────────

function makeUser(overrides: Partial<AdminUserDTO> = {}): AdminUserDTO {
  return {
    id: 1,
    email: 'alice@test.com',
    firstname: 'Alice',
    lastname: 'Martin',
    role: 'visitor',
    emailVerified: true,
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

// ── Helper: wrap with providers and pre-authenticate as admin ─────────────

/**
 * UsersPage requires useAuth().user to render the Actions column.
 * We need to login first, then render the page.
 */
function AuthenticatedUsersPage() {
  const { login, isAuthenticated } = useAuth();

  // Auto-login on mount
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

// ============================================================================
// Users page
// ============================================================================

describe('UsersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: apiPost resolves for login (admin user) — AuthSessionResponse shape
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

    // Role badges — roles also appear in the filter dropdown, so use getAllByText
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

    // Role filter dropdown
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

    // Pagination controls
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

    // Admin sees "Change Role" buttons
    const changeRoleButtons = screen.getAllByText('Change Role');
    expect(changeRoleButtons.length).toBe(3); // one per user
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

    // Click the first "Change Role" button
    const changeRoleButtons = screen.getAllByText('Change Role');
    fireEvent.click(changeRoleButtons[0]);

    // Modal should appear with role select
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Modal shows user info
    expect(screen.getByText('Alice Martin (alice@test.com)')).toBeInTheDocument();

    // Confirm button should be disabled when role hasn't changed
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
    // First call: initial load
    mockApiGet.mockResolvedValueOnce(mockUsersPage1);

    render(
      <Providers>
        <AuthenticatedUsersPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('Alice Martin')).toBeInTheDocument();
    });

    // Second call after search: return filtered results
    mockApiGet.mockResolvedValueOnce({
      data: [makeUser({ id: 1, firstname: 'Alice', lastname: 'Martin', email: 'alice@test.com' })],
      page: 1,
      limit: 10,
      total: 1,
      totalPages: 1,
    });

    // Type in search
    fireEvent.change(screen.getByPlaceholderText('Search...'), {
      target: { value: 'alice' },
    });

    // Wait for debounce + API call
    await waitFor(
      () => {
        // Check that apiGet was called with search param
        const lastCall = mockApiGet.mock.calls.at(-1)?.[0] as string;
        expect(lastCall).toContain('search=alice');
      },
      { timeout: 1000 },
    );
  });
});
