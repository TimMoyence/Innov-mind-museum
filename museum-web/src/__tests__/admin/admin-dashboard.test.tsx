/**
 * Admin dashboard page tests — loading state, stats rendering, error handling.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider } from '@/lib/auth';
import { AdminDictProvider } from '@/lib/admin-dictionary';
import AdminDashboardPage from '@/app/[locale]/admin/page';
import type { Dictionary } from '@/lib/i18n';
import type { DashboardStats } from '@/lib/admin-types';

// ── Next.js mocks ───────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  usePathname: () => '/en/admin',
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

vi.mock('@/lib/api', () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args) as Promise<unknown>,
  apiPost: vi.fn(),
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

// ── Helper: wrap with required providers ─────────────────────────────────────

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AdminDictProvider dict={mockAdminDict}>
      <AuthProvider>{children}</AuthProvider>
    </AdminDictProvider>
  );
}

// ── Test data ───────────────────────────────────────────────────────────────

const mockStats: DashboardStats = {
  totalUsers: 1250,
  activeUsers: 430,
  totalConversations: 8920,
  totalMessages: 45000,
  newUsersToday: 12,
  messagesThisWeek: 3200,
};

// ============================================================================
// Dashboard page
// ============================================================================

describe('AdminDashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the dashboard heading', () => {
    mockApiGet.mockReturnValue(
      new Promise(() => {
        /* pending forever */
      }),
    ); // never resolves — stays in loading

    render(
      <Providers>
        <AdminDashboardPage />
      </Providers>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
  });

  it('shows loading spinner while fetching stats', () => {
    mockApiGet.mockReturnValue(
      new Promise(() => {
        /* pending forever */
      }),
    ); // never resolves

    render(
      <Providers>
        <AdminDashboardPage />
      </Providers>,
    );

    // The spinner has animate-spin class
    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('renders stat cards after data loads', async () => {
    mockApiGet.mockResolvedValueOnce(mockStats);

    render(
      <Providers>
        <AdminDashboardPage />
      </Providers>,
    );

    // toLocaleString() formatting varies by environment — match flexibly
    await waitFor(() => {
      expect(screen.getByText('Total Users')).toBeInTheDocument();
    });

    // Verify stat labels are rendered
    expect(screen.getByText('Active Users')).toBeInTheDocument();
    expect(screen.getByText('Conversations')).toBeInTheDocument();
    expect(screen.getByText('Messages')).toBeInTheDocument();
    expect(screen.getByText('New Today')).toBeInTheDocument();
    expect(screen.getByText('Messages This Week')).toBeInTheDocument();

    // Verify numeric values are present (use regex to handle locale-specific separators)
    expect(screen.getByText(/1.?250/)).toBeInTheDocument();
    expect(screen.getByText('430')).toBeInTheDocument();
    expect(screen.getByText(/8.?920/)).toBeInTheDocument();
    expect(screen.getByText(/45.?000/)).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText(/3.?200/)).toBeInTheDocument();
  });

  it('hides loading spinner after data loads', async () => {
    mockApiGet.mockResolvedValueOnce(mockStats);

    render(
      <Providers>
        <AdminDashboardPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('Total Users')).toBeInTheDocument();
    });

    // Spinner should be gone
    const spinner = document.querySelector('.animate-spin');
    expect(spinner).not.toBeInTheDocument();
  });

  it('handles API error gracefully', async () => {
    mockApiGet.mockRejectedValueOnce(new Error('Network error'));

    render(
      <Providers>
        <AdminDashboardPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });

    // Stat cards should NOT be rendered
    expect(screen.queryByText('Total Users')).not.toBeInTheDocument();
  });

  it('shows fallback error message for non-Error throws', async () => {
    mockApiGet.mockRejectedValueOnce('some string error');

    render(
      <Providers>
        <AdminDashboardPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('Failed to load stats')).toBeInTheDocument();
    });
  });

  it('calls the correct API endpoint', async () => {
    mockApiGet.mockResolvedValueOnce(mockStats);

    render(
      <Providers>
        <AdminDashboardPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledWith('/api/admin/stats');
    });
  });
});
