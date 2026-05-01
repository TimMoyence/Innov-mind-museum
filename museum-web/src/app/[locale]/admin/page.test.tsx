/**
 * AdminDashboardPage — verifies stat labels are read from the dictionary
 * (post-T2.1 refactor that removed the hardcoded STAT_LABELS map).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider } from '@/lib/auth';
import { AdminDictProvider } from '@/lib/admin-dictionary';
import AdminDashboardPage from './page';
import { mockAdminDict } from '@/__tests__/helpers/admin-dict.fixture';
import type { AdminStats } from '@/lib/admin-types';

// ── Next.js mocks ───────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  usePathname: () => '/fr/admin',
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

// ── Test data ───────────────────────────────────────────────────────────────

const mockStats: AdminStats = {
  totalUsers: 12,
  usersByRole: { visitor: 10, admin: 2 },
  totalSessions: 7,
  totalMessages: 42,
  recentSignups: 1,
  recentSessions: 9,
};

/** French dictionary slice — exercises the new `dashboardPage.stats` lookup. */
const frenchDict: typeof mockAdminDict = {
  ...mockAdminDict,
  dashboardPage: {
    subtitle: "Vue d'ensemble de votre plateforme Musaium.",
    stats: {
      totalUsers: 'Utilisateurs totaux',
      totalSessions: 'Sessions totales',
      totalMessages: 'Messages totaux',
      recentSignups: 'Nouveaux cette semaine',
      recentSessions: 'Sessions récentes',
    },
  },
};

function FrenchProviders({ children }: { children: React.ReactNode }) {
  return (
    <AdminDictProvider dict={frenchDict} locale="fr">
      <AuthProvider>{children}</AuthProvider>
    </AdminDictProvider>
  );
}

function EnglishProviders({ children }: { children: React.ReactNode }) {
  return (
    <AdminDictProvider dict={mockAdminDict} locale="en">
      <AuthProvider>{children}</AuthProvider>
    </AdminDictProvider>
  );
}

// ============================================================================

describe('AdminDashboardPage stats labels (T2.1: dictionary-driven)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders localized French stat labels from the dictionary', async () => {
    mockApiGet.mockResolvedValueOnce(mockStats);

    render(
      <FrenchProviders>
        <AdminDashboardPage />
      </FrenchProviders>,
    );

    await waitFor(() => {
      expect(screen.getByText('Utilisateurs totaux')).toBeInTheDocument();
    });
    expect(screen.getByText('Sessions totales')).toBeInTheDocument();
    expect(screen.getByText('Nouveaux cette semaine')).toBeInTheDocument();
    expect(screen.getByText('Sessions récentes')).toBeInTheDocument();
  });

  it('renders localized English stat labels from the dictionary', async () => {
    mockApiGet.mockResolvedValueOnce(mockStats);

    render(
      <EnglishProviders>
        <AdminDashboardPage />
      </EnglishProviders>,
    );

    await waitFor(() => {
      expect(screen.getByText('Total Users')).toBeInTheDocument();
    });
    expect(screen.getByText('New This Week')).toBeInTheDocument();
    expect(screen.getByText('Recent Sessions')).toBeInTheDocument();
  });

  it('renders the localized subtitle from the dictionary', async () => {
    mockApiGet.mockResolvedValueOnce(mockStats);

    render(
      <FrenchProviders>
        <AdminDashboardPage />
      </FrenchProviders>,
    );

    await waitFor(() => {
      expect(screen.getByText("Vue d'ensemble de votre plateforme Musaium.")).toBeInTheDocument();
    });
  });
});
