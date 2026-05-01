/**
 * Admin dashboard page tests — loading state, stats rendering, error handling.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider } from '@/lib/auth';
import { AdminDictProvider } from '@/lib/admin-dictionary';
import AdminDashboardPage from '@/app/[locale]/admin/page';
import { mockAdminDict } from '@/__tests__/helpers/admin-dict.fixture';
import type { AdminStats } from '@/lib/admin-types';

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

// ── Helper: wrap with required providers ─────────────────────────────────────

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AdminDictProvider dict={mockAdminDict} locale="en">
      <AuthProvider>{children}</AuthProvider>
    </AdminDictProvider>
  );
}

// ── Test data ───────────────────────────────────────────────────────────────

const mockStats: AdminStats = {
  totalUsers: 1250,
  usersByRole: { visitor: 1100, moderator: 100, admin: 50 },
  totalSessions: 8920,
  totalMessages: 45000,
  recentSignups: 12,
  recentSessions: 3200,
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
    expect(screen.getByText('Total Sessions')).toBeInTheDocument();
    expect(screen.getByText('Total Messages')).toBeInTheDocument();
    expect(screen.getByText('New This Week')).toBeInTheDocument();
    expect(screen.getByText('Recent Sessions')).toBeInTheDocument();

    // Verify numeric values are present (use regex to handle locale-specific separators)
    expect(screen.getByText(/1.?250/)).toBeInTheDocument();
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
