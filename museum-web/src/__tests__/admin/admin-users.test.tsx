/**
 * Admin users page tests — user list, role change, pagination.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '@/lib/auth';
import { AdminDictProvider } from '@/lib/admin-dictionary';
import UsersPage from '@/app/[locale]/admin/users/page';
import type { Dictionary } from '@/lib/i18n';
import type { PaginatedResponse, User } from '@/lib/admin-types';

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

// ── Admin dictionary fixture ────────────────────────────────────────────────

const mockAdminDict: Dictionary['admin'] = {
  dashboard: 'Dashboard',
  users: 'Users',
  auditLogs: 'Audit Logs',
  reports: 'Reports',
  analytics: 'Analytics',
  tickets: 'Tickets',
  supportAdmin: 'Support',
  accessDenied: 'Access Denied',
  goToHomepage: 'Go to Homepage',
  login: {
    title: 'Admin Login',
    emailPlaceholder: 'Email',
    passwordPlaceholder: 'Password',
    submit: 'Sign In',
    error: 'Invalid credentials',
  },
  common: {
    date: 'Date',
    status: 'Status',
    priority: 'Priority',
    actions: 'Actions',
    messages: 'Messages',
    user: 'User',
    userId: 'User ID',
    subject: 'Subject',
    confirm: 'Confirm',
    cancel: 'Cancel',
    previous: 'Previous',
    next: 'Next',
    pageOf: 'Page {page} of {totalPages} ({total} total)',
    allStatuses: 'All statuses',
    allPriorities: 'All priorities',
    noData: 'No data',
    conversations: 'Conversations',
    active: 'Active',
    inactive: 'Inactive',
  },
  dashboardPage: {
    subtitle: 'Overview of your Musaium platform.',
  },
  auditLogsPage: {
    subtitle: 'Review system audit logs.',
    filterPlaceholder: 'Filter by action...',
    columnUser: 'User',
    columnAction: 'Action',
    columnResource: 'Resource',
    columnDetails: 'Details',
    emptyState: 'No audit logs found.',
  },
  usersPage: {
    subtitle: 'Manage platform users.',
    searchPlaceholder: 'Search...',
    allRoles: 'All roles',
    columnName: 'Name',
    columnRole: 'Role',
    columnStatus: 'Status',
    columnLastLogin: 'Last Login',
    emptyState: 'No users found.',
    changeRole: 'Change Role',
  },
  reportsPage: {
    subtitle: '',
    reason: 'Reason',
    message: 'Message',
    review: 'Review',
    reviewReport: 'Review Report',
    reportedMessage: 'Reported message',
    reviewerNotes: 'Notes',
    reviewerNotesPlaceholder: '',
    noReports: 'No reports',
  },
  ticketsPage: {
    subtitle: '',
    update: 'Update',
    view: 'View',
    updateTicket: 'Update Ticket',
    noTickets: 'No tickets',
  },
  supportPage: {
    subtitle: '',
    selectTicket: 'Select a ticket',
    viewTickets: 'View Tickets',
    backToTickets: 'Back',
    createdAt: 'Created',
    description: 'Description',
    noMessages: 'No messages',
    reply: 'Reply',
    replyPlaceholder: 'Type your reply...',
    send: 'Send',
    sending: 'Sending...',
  },
  analyticsPage: {
    subtitle: '',
    avgMessages: 'Avg Messages',
    avgDuration: 'Avg Duration',
    returnRate: 'Return Rate',
    uniqueUsers: 'Unique Users',
    returningUsers: 'Returning Users',
    usage: 'Usage',
    daily: 'Daily',
    weekly: 'Weekly',
    monthly: 'Monthly',
    days: 'Days',
    sessions: 'Sessions',
    messagesSent: 'Messages Sent',
    activeUsers: 'Active Users',
    topArtworks: 'Top Artworks',
    topMuseums: 'Top Museums',
    museum: 'Museum',
    guardrailBlockRate: 'Block Rate',
  },
};

// ── Test data ───────────────────────────────────────────────────────────────

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: '1',
    email: 'alice@test.com',
    name: 'Alice Martin',
    role: 'visitor',
    isActive: true,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-06-01T00:00:00Z',
    lastLoginAt: '2025-06-01T12:00:00Z',
    ...overrides,
  };
}

const mockUsersPage1: PaginatedResponse<User> = {
  data: [
    makeUser({ id: '1', name: 'Alice Martin', email: 'alice@test.com', role: 'visitor' }),
    makeUser({ id: '2', name: 'Bob Dupont', email: 'bob@test.com', role: 'admin' }),
    makeUser({ id: '3', name: 'Charlie Renard', email: 'charlie@test.com', role: 'moderator' }),
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

    // Default: apiPost resolves for login (admin user)
    mockApiPost.mockResolvedValue({
      user: { id: '99', email: 'admin@test.com', name: 'Super Admin', role: 'admin' },
      tokens: { accessToken: 'at', refreshToken: 'rt' },
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
      data: [makeUser({ id: '1', name: 'Alice Martin', email: 'alice@test.com' })],
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
