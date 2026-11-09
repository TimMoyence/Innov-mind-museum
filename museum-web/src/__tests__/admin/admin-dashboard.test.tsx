import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider } from '@/lib/auth';
import { AdminDictProvider } from '@/lib/admin-dictionary';
import AdminDashboardPage from '@/app/[locale]/admin/page';
import { mockAdminDict } from '@/__tests__/helpers/admin-dict.fixture';
import type { AdminStats } from '@/lib/admin-types';

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

const mockApiGet = vi.fn();

vi.mock('@/lib/api', () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args) as Promise<unknown>,
  apiPost: vi.fn(),
  registerLogoutHandler: vi.fn(),
}));

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AdminDictProvider dict={mockAdminDict} locale="en">
      <AuthProvider>{children}</AuthProvider>
    </AdminDictProvider>
  );
}

const mockStats: AdminStats = {
  totalUsers: 1250,
  usersByRole: { visitor: 1100, moderator: 100, admin: 50 },
  totalSessions: 8920,
  totalMessages: 45000,
  recentSignups: 12,
  recentSessions: 3200,
};

describe('AdminDashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the dashboard heading', () => {
    mockApiGet.mockReturnValue(new Promise(() => {}));

    render(
      <Providers>
        <AdminDashboardPage />
      </Providers>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
  });

  it('shows loading spinner while fetching stats', () => {
    mockApiGet.mockReturnValue(new Promise(() => {}));

    render(
      <Providers>
        <AdminDashboardPage />
      </Providers>,
    );

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

    await waitFor(() => {
      expect(screen.getByText('Total Users')).toBeInTheDocument();
    });

    expect(screen.getByText('Total Sessions')).toBeInTheDocument();
    expect(screen.getByText('Total Messages')).toBeInTheDocument();
    expect(screen.getByText('New This Week')).toBeInTheDocument();
    expect(screen.getByText('Recent Sessions')).toBeInTheDocument();

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
      expect(mockApiGet).toHaveBeenCalled();
      expect(mockApiGet.mock.calls[0]?.[0]).toBe('/api/admin/stats');
    });
  });
});
