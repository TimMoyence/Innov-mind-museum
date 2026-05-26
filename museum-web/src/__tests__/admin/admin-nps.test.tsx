/**
 * T-WEB-2 (RED) — C2 / S-WEB — admin NPS dashboard page.
 *
 * Pins R24/R25/R27 BEFORE implementation:
 *  - the page renders the NPS score + promoters/passives/detractors + count
 *    from a mocked `NpsResponse` (R24, R27 — no client re-aggregation, it just
 *    consumes the endpoint payload);
 *  - the museum `<select>` is PRESENT for an `admin` and ABSENT for a
 *    `museum_manager` (R25 — UI defense-in-depth atop the BE scoping);
 *  - `count === 0` routes to the accessible empty placeholder (no recharts
 *    blank axes).
 *
 * MUST FAIL at baseline: `@/app/[locale]/admin/nps/page` does not exist, so the
 * static import below cannot resolve and the suite errors out (red success).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AdminDictProvider } from '@/lib/admin-dictionary';
// RED: this module does not exist yet — import resolution fails, proving the
// dashboard route is absent (R24).
import NpsPage from '@/app/[locale]/admin/nps/page';
import { mockAdminDict } from '../helpers/admin-dict.fixture';
import type { UserRole } from '@/lib/admin-types';

// ── Next.js mocks ───────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  usePathname: () => '/en/admin/nps',
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

// ── Recharts mock (client-only; JSDOM has no ResizeObserver — recharts
//    PATTERNS.md §10 "mock every component"). ────────────────────────────────

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="chart-container">{children}</div>
  ),
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="bar-chart">{children}</div>
  ),
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
}));

// ── Auth mock — lets each test pick the active role (R25). ───────────────────

let mockRole: UserRole = 'admin';

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    user: { id: 1, email: 'a@b.co', name: 'Tester', role: mockRole },
    isAuthenticated: true,
    isLoading: false,
    isHydrating: false,
    login: vi.fn(),
    logout: vi.fn(),
  }),
}));

// ── API mock ────────────────────────────────────────────────────────────────

const mockApiGet = vi.fn();

vi.mock('@/lib/api', () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args) as Promise<unknown>,
  apiPost: vi.fn(),
  registerLogoutHandler: vi.fn(),
}));

// ── Providers ─────────────────────────────────────────────────────────────

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AdminDictProvider dict={mockAdminDict} locale="en">
      {children}
    </AdminDictProvider>
  );
}

// ── Test data ───────────────────────────────────────────────────────────────

const mockNps = {
  nps: 47,
  promoters: 60,
  passives: 27,
  detractors: 13,
  count: 100,
};

const emptyNps = {
  nps: 0,
  promoters: 0,
  passives: 0,
  detractors: 0,
  count: 0,
};

// ============================================================================

describe('AdminNpsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRole = 'admin';
  });

  it('renders the NPS score and the three buckets + count from the endpoint', async () => {
    mockApiGet.mockResolvedValue(mockNps);

    render(
      <Providers>
        <NpsPage />
      </Providers>,
    );

    // NPS headline score (R24).
    await waitFor(() => {
      expect(screen.getByText('47')).toBeInTheDocument();
    });
    // The three buckets + total count, all sourced from the payload (R27).
    expect(screen.getByText('60')).toBeInTheDocument();
    expect(screen.getByText('27')).toBeInTheDocument();
    expect(screen.getByText('13')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
  });

  it('fetches the NPS endpoint (no client re-aggregation — R27)', async () => {
    mockApiGet.mockResolvedValue(mockNps);

    render(
      <Providers>
        <NpsPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalled();
    });
    const firstCall = mockApiGet.mock.calls[0]?.[0] as string;
    expect(firstCall).toContain('/api/admin/nps');
  });

  it('shows the museum selector for an admin (R25)', async () => {
    mockRole = 'admin';
    mockApiGet.mockResolvedValue(mockNps);

    render(
      <Providers>
        <NpsPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('47')).toBeInTheDocument();
    });
    expect(screen.getByRole('combobox', { name: 'Museum' })).toBeInTheDocument();
  });

  it('hides the museum selector for a museum_manager (R25)', async () => {
    mockRole = 'museum_manager';
    mockApiGet.mockResolvedValue(mockNps);

    render(
      <Providers>
        <NpsPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('47')).toBeInTheDocument();
    });
    expect(screen.queryByRole('combobox', { name: 'Museum' })).not.toBeInTheDocument();
  });

  it('renders the accessible empty placeholder when count is zero', async () => {
    mockApiGet.mockResolvedValue(emptyNps);

    render(
      <Providers>
        <NpsPage />
      </Providers>,
    );

    await waitFor(() => {
      const placeholders = screen.getAllByRole('status', { name: 'No data' });
      expect(placeholders.length).toBeGreaterThanOrEqual(1);
    });
    // The recharts bucket chart is NOT rendered for an all-zero scope.
    expect(screen.queryByTestId('bar-chart')).not.toBeInTheDocument();
  });
});
