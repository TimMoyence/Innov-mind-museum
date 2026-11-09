import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider } from '@/lib/auth';
import { AdminDictProvider } from '@/lib/admin-dictionary';
import AnalyticsPage from '@/app/[locale]/admin/analytics/page';
import { mockAdminDict } from '@/__tests__/helpers/admin-dict.fixture';
import type { UsageAnalytics, ContentAnalytics, EngagementAnalytics } from '@/lib/admin-types';

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

const calledUrls: string[] = [];
const mockApiGet = vi.fn();

vi.mock('@/lib/api', () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args) as Promise<unknown>,
  apiPost: vi.fn(),
  registerLogoutHandler: vi.fn(),
}));

const mockUsage: UsageAnalytics = {
  period: { from: '2025-05-01', to: '2025-05-30' },
  granularity: 'daily',
  sessionsCreated: [{ date: '2025-05-01', count: 10 }],
  messagesSent: [{ date: '2025-05-01', count: 50 }],
  activeUsers: [{ date: '2025-05-01', count: 8 }],
};

const mockContent: ContentAnalytics = {
  topArtworks: [{ title: 'Mona Lisa', artist: 'Leonardo da Vinci', count: 320 }],
  topMuseums: [{ name: 'Louvre', count: 1500 }],
  guardrailBlockRate: 0.032,
};

const mockEngagement: EngagementAnalytics = {
  avgMessagesPerSession: 6.3,
  avgSessionDurationMinutes: 4.8,
  returnUserRate: 0.42,
  totalUniqueUsers: 1250,
  returningUsers: 525,
};

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AdminDictProvider dict={mockAdminDict} locale="en">
      <AuthProvider>{children}</AuthProvider>
    </AdminDictProvider>
  );
}

describe('AnalyticsPage — no museumId plumbing (C1B / R9 / AC-8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    calledUrls.length = 0;
    mockApiGet.mockImplementation((url: string) => {
      calledUrls.push(url);
      if (url.startsWith('/api/museums')) {
        return Promise.resolve({ museums: [{ id: 42, name: 'Test Museum' }] });
      }
      if (url.startsWith('/api/admin/analytics/usage')) return Promise.resolve(mockUsage);
      if (url.startsWith('/api/admin/analytics/content')) return Promise.resolve(mockContent);
      if (url.startsWith('/api/admin/analytics/engagement')) {
        return Promise.resolve(mockEngagement);
      }
      return Promise.resolve({});
    });
  });

  it('does NOT render the per-museum filter select', async () => {
    render(
      <Providers>
        <AnalyticsPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('Avg Messages')).toBeInTheDocument();
    });

    expect(screen.queryByLabelText('Museum')).toBeNull();
  });

  it('issues NO analytics request carrying a museumId query key', async () => {
    render(
      <Providers>
        <AnalyticsPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('Avg Messages')).toBeInTheDocument();
    });

    const analyticsUrls = calledUrls.filter((u) => u.startsWith('/api/admin/analytics/'));
    expect(analyticsUrls.length).toBeGreaterThanOrEqual(3);
    for (const url of analyticsUrls) {
      expect(url).not.toContain('museumId');
    }
  });
});
