import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ApiError } from '@/lib/api';
import type * as ApiModule from '@/lib/api';
import { AdminDictProvider } from '@/lib/admin-dictionary';
import NpsPage from '@/app/[locale]/admin/nps/page';
import { mockAdminDict } from '../helpers/admin-dict.fixture';
import type { UserRole } from '@/lib/admin-types';

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

const mockApiGet = vi.fn();

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof ApiModule>('@/lib/api');
  return {
    ApiError: actual.ApiError,
    apiGet: (...args: unknown[]) => mockApiGet(...args) as Promise<unknown>,
    apiPost: vi.fn(),
    registerLogoutHandler: vi.fn(),
  };
});

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AdminDictProvider dict={mockAdminDict} locale="en">
      {children}
    </AdminDictProvider>
  );
}

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

    await waitFor(() => {
      expect(screen.getByText('47')).toBeInTheDocument();
    });
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

  it('shows the actionable no-museum-assigned message on a 403 scope error (F6)', async () => {
    mockRole = 'museum_manager';
    mockApiGet.mockRejectedValue(new ApiError(403, 'Forbidden', 'No museum assigned'));

    render(
      <Providers>
        <NpsPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText(mockAdminDict.npsPage.noMuseumAssigned)).toBeInTheDocument();
    });
    expect(screen.queryByText('No museum assigned')).not.toBeInTheDocument();
  });

  it('still shows the raw error message for a non-403 fetch failure', async () => {
    mockApiGet.mockRejectedValue(new ApiError(500, 'Internal Server Error', 'Boom'));

    render(
      <Providers>
        <NpsPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('Boom')).toBeInTheDocument();
    });
    expect(screen.queryByText(mockAdminDict.npsPage.noMuseumAssigned)).not.toBeInTheDocument();
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
    expect(screen.queryByTestId('bar-chart')).not.toBeInTheDocument();
  });
});
