/**
 * Admin analytics page tests — KPI cards, usage charts, content analytics, filters, error handling.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthProvider } from '@/lib/auth';
import { AdminDictProvider } from '@/lib/admin-dictionary';
import AnalyticsPage from '@/app/[locale]/admin/analytics/page';
import type { UsageAnalytics, ContentAnalytics, EngagementAnalytics } from '@/lib/admin-types';
import { mockAdminDict } from '../helpers/admin-dict.fixture';

// ── Next.js mocks ───────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  usePathname: () => '/en/admin/analytics',
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

// ── Recharts mock ──────────────────────────────────────────────────────────

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="chart-container">{children}</div>
  ),
  LineChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="line-chart">{children}</div>
  ),
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="bar-chart">{children}</div>
  ),
  Line: () => null,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
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
    <AdminDictProvider dict={mockAdminDict}>
      <AuthProvider>{children}</AuthProvider>
    </AdminDictProvider>
  );
}

// ── Test data ───────────────────────────────────────────────────────────────

const mockUsage: UsageAnalytics = {
  period: { from: '2025-05-01', to: '2025-05-30' },
  granularity: 'daily',
  sessionsCreated: [
    { date: '2025-05-01', count: 10 },
    { date: '2025-05-02', count: 15 },
  ],
  messagesSent: [
    { date: '2025-05-01', count: 50 },
    { date: '2025-05-02', count: 72 },
  ],
  activeUsers: [
    { date: '2025-05-01', count: 8 },
    { date: '2025-05-02', count: 12 },
  ],
};

const mockContent: ContentAnalytics = {
  topArtworks: [
    { title: 'Mona Lisa', artist: 'Leonardo da Vinci', count: 320 },
    { title: 'Starry Night', artist: 'Vincent van Gogh', count: 210 },
  ],
  topMuseums: [
    { name: 'Louvre', count: 1500 },
    { name: 'Orsay', count: 800 },
  ],
  guardrailBlockRate: 0.032,
};

const mockEngagement: EngagementAnalytics = {
  avgMessagesPerSession: 6.3,
  avgSessionDurationMinutes: 4.8,
  returnUserRate: 0.42,
  totalUniqueUsers: 1250,
  returningUsers: 525,
};

// Helper: resolve all three parallel API calls
function mockAllApiCalls() {
  mockApiGet
    .mockResolvedValueOnce(mockUsage)
    .mockResolvedValueOnce(mockContent)
    .mockResolvedValueOnce(mockEngagement);
}

// ============================================================================
// Analytics page
// ============================================================================

describe('AnalyticsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the analytics heading', () => {
    mockApiGet.mockReturnValue(
      new Promise(() => {
        /* pending */
      }),
    );

    render(
      <Providers>
        <AnalyticsPage />
      </Providers>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Analytics' })).toBeInTheDocument();
  });

  it('shows loading spinner while fetching data', () => {
    mockApiGet.mockReturnValue(
      new Promise(() => {
        /* pending */
      }),
    );

    render(
      <Providers>
        <AnalyticsPage />
      </Providers>,
    );

    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('renders KPI cards after data loads', async () => {
    mockAllApiCalls();

    render(
      <Providers>
        <AnalyticsPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('Avg Messages')).toBeInTheDocument();
    });

    expect(screen.getByText('6.3')).toBeInTheDocument();
    expect(screen.getByText('Avg Duration')).toBeInTheDocument();
    expect(screen.getByText('4.8')).toBeInTheDocument();
    expect(screen.getByText('Return Rate')).toBeInTheDocument();
    expect(screen.getByText('42.0%')).toBeInTheDocument();
    expect(screen.getByText('Unique Users')).toBeInTheDocument();
    expect(screen.getByText(/1.?250/)).toBeInTheDocument();
    expect(screen.getByText('Returning Users')).toBeInTheDocument();
    expect(screen.getByText('525')).toBeInTheDocument();
  });

  it('renders usage charts after data loads', async () => {
    mockAllApiCalls();

    render(
      <Providers>
        <AnalyticsPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('Usage')).toBeInTheDocument();
    });

    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
  });

  it('renders content analytics — top artworks bar chart and top museums table', async () => {
    mockAllApiCalls();

    render(
      <Providers>
        <AnalyticsPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('Top Artworks')).toBeInTheDocument();
    });

    expect(screen.getByText('Top Museums')).toBeInTheDocument();
    expect(screen.getByText('Louvre')).toBeInTheDocument();
    expect(screen.getByText(/1.?500/)).toBeInTheDocument();
    expect(screen.getByText('Orsay')).toBeInTheDocument();
    expect(screen.getByText('800')).toBeInTheDocument();
  });

  it('renders guardrail block rate', async () => {
    mockAllApiCalls();

    render(
      <Providers>
        <AnalyticsPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('Block Rate')).toBeInTheDocument();
    });

    expect(screen.getByText('3.2%')).toBeInTheDocument();
  });

  it('shows "No data" when top artworks list is empty', async () => {
    mockApiGet
      .mockResolvedValueOnce(mockUsage)
      .mockResolvedValueOnce({ ...mockContent, topArtworks: [], topMuseums: [] })
      .mockResolvedValueOnce(mockEngagement);

    render(
      <Providers>
        <AnalyticsPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('Top Artworks')).toBeInTheDocument();
    });

    const noDataTexts = screen.getAllByText('No data');
    expect(noDataTexts.length).toBe(2);
  });

  it('hides loading spinner after data loads', async () => {
    mockAllApiCalls();

    render(
      <Providers>
        <AnalyticsPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('Avg Messages')).toBeInTheDocument();
    });

    const spinner = document.querySelector('.animate-spin');
    expect(spinner).not.toBeInTheDocument();
  });

  it('handles API error gracefully', async () => {
    mockApiGet.mockRejectedValueOnce(new Error('Analytics unavailable'));

    render(
      <Providers>
        <AnalyticsPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('Analytics unavailable')).toBeInTheDocument();
    });

    expect(screen.queryByText('Avg Messages')).not.toBeInTheDocument();
  });

  it('shows fallback error message for non-Error throws', async () => {
    mockApiGet.mockRejectedValueOnce('unexpected');

    render(
      <Providers>
        <AnalyticsPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('Failed to load analytics')).toBeInTheDocument();
    });
  });

  it('renders granularity and days filter dropdowns', async () => {
    mockAllApiCalls();

    render(
      <Providers>
        <AnalyticsPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('Usage')).toBeInTheDocument();
    });

    expect(screen.getByDisplayValue('Daily')).toBeInTheDocument();
    // The days select option text is "30 Days" (value is numeric 30)
    expect(screen.getByDisplayValue('30 Days')).toBeInTheDocument();
  });

  it('calls the correct API endpoints on mount', async () => {
    mockAllApiCalls();

    render(
      <Providers>
        <AnalyticsPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledTimes(3);
    });

    expect(mockApiGet).toHaveBeenCalledWith('/api/admin/analytics/usage?days=30&granularity=daily');
    expect(mockApiGet).toHaveBeenCalledWith('/api/admin/analytics/content?limit=10');
    expect(mockApiGet).toHaveBeenCalledWith('/api/admin/analytics/engagement');
  });

  it('re-fetches usage when granularity filter changes', async () => {
    mockAllApiCalls();

    render(
      <Providers>
        <AnalyticsPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('Usage')).toBeInTheDocument();
    });

    // Prepare the next API call for the filter change
    mockApiGet.mockResolvedValueOnce(mockUsage);

    fireEvent.change(screen.getByDisplayValue('Daily'), {
      target: { value: 'weekly' },
    });

    await waitFor(() => {
      const calls = mockApiGet.mock.calls;
      const lastCall = calls[calls.length - 1][0] as string;
      expect(lastCall).toContain('granularity=weekly');
    });
  });
});
