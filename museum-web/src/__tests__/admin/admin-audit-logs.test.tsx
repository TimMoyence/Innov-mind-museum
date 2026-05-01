/**
 * Admin audit logs page tests — log list, action filter, pagination, empty state, error handling.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthProvider } from '@/lib/auth';
import { AdminDictProvider } from '@/lib/admin-dictionary';
import AuditLogsPage from '@/app/[locale]/admin/audit-logs/page';
import type { AdminAuditLogDTO, PaginatedResponse } from '@/lib/admin-types';
import { mockAdminDict } from '../helpers/admin-dict.fixture';

// ── Next.js mocks ───────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  usePathname: () => '/en/admin/audit-logs',
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

function makeAuditLog(overrides: Partial<AdminAuditLogDTO> = {}): AdminAuditLogDTO {
  return {
    id: 'log-1',
    actorType: 'user',
    actorId: 1,
    action: 'USER_ROLE_CHANGE',
    targetType: 'user',
    targetId: 'res-abc123def',
    metadata: { oldRole: 'visitor', newRole: 'moderator' },
    ip: '192.168.1.1',
    createdAt: '2025-06-01T10:30:00Z',
    ...overrides,
  };
}

const mockLogsPage1: PaginatedResponse<AdminAuditLogDTO> = {
  data: [
    makeAuditLog({ id: 'log-1', action: 'USER_ROLE_CHANGE', actorId: 1 }),
    makeAuditLog({
      id: 'log-2',
      action: 'USER_LOGIN',
      actorId: 2,
      targetId: null,
      metadata: null,
    }),
    makeAuditLog({ id: 'log-3', action: 'REPORT_REVIEW', actorId: null, ip: null }),
  ],
  page: 1,
  limit: 20,
  total: 45,
  totalPages: 3,
};

// ============================================================================
// Audit Logs page
// ============================================================================

describe('AuditLogsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the audit logs heading', () => {
    mockApiGet.mockResolvedValueOnce(mockLogsPage1);

    render(
      <Providers>
        <AuditLogsPage />
      </Providers>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Audit Logs' })).toBeInTheDocument();
  });

  it('shows loading spinner while fetching logs', () => {
    mockApiGet.mockReturnValue(
      new Promise(() => {
        /* pending */
      }),
    );

    render(
      <Providers>
        <AuditLogsPage />
      </Providers>,
    );

    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('renders log entries after data loads', async () => {
    mockApiGet.mockResolvedValueOnce(mockLogsPage1);

    render(
      <Providers>
        <AuditLogsPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('USER_ROLE_CHANGE')).toBeInTheDocument();
    });

    expect(screen.getByText('USER_LOGIN')).toBeInTheDocument();
    expect(screen.getByText('REPORT_REVIEW')).toBeInTheDocument();
  });

  it('renders table column headers', async () => {
    mockApiGet.mockResolvedValueOnce(mockLogsPage1);

    render(
      <Providers>
        <AuditLogsPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('USER_ROLE_CHANGE')).toBeInTheDocument();
    });

    expect(screen.getByText('Action')).toBeInTheDocument();
    expect(screen.getByText('Resource')).toBeInTheDocument();
    expect(screen.getByText('Details')).toBeInTheDocument();
    expect(screen.getByText('IP')).toBeInTheDocument();
    expect(screen.getByText('User')).toBeInTheDocument();
  });

  it('displays targetType with truncated targetId', async () => {
    mockApiGet.mockResolvedValueOnce(mockLogsPage1);

    render(
      <Providers>
        <AuditLogsPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('USER_ROLE_CHANGE')).toBeInTheDocument();
    });

    // targetId "res-abc123def" truncated to first 8 chars: "res-abc1"
    // Two logs share the same targetId, so use getAllByText
    const resourceCells = screen.getAllByText('user #res-abc1');
    expect(resourceCells.length).toBe(2);
  });

  it('shows dash for null actorId and ip', async () => {
    mockApiGet.mockResolvedValueOnce(mockLogsPage1);

    render(
      <Providers>
        <AuditLogsPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('REPORT_REVIEW')).toBeInTheDocument();
    });

    // Null values render as dashes
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it('renders pagination when totalPages > 1', async () => {
    mockApiGet.mockResolvedValueOnce(mockLogsPage1);

    render(
      <Providers>
        <AuditLogsPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('USER_ROLE_CHANGE')).toBeInTheDocument();
    });

    expect(screen.getByText('Previous')).toBeInTheDocument();
    expect(screen.getByText('Next')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 3 (45 total)')).toBeInTheDocument();
  });

  it('previous button is disabled on first page', async () => {
    mockApiGet.mockResolvedValueOnce(mockLogsPage1);

    render(
      <Providers>
        <AuditLogsPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('USER_ROLE_CHANGE')).toBeInTheDocument();
    });

    expect(screen.getByText('Previous')).toBeDisabled();
    expect(screen.getByText('Next')).not.toBeDisabled();
  });

  it('shows empty state when no logs found', async () => {
    mockApiGet.mockResolvedValueOnce({
      data: [],
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
    });

    render(
      <Providers>
        <AuditLogsPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('No audit logs found.')).toBeInTheDocument();
    });
  });

  it('handles API error gracefully', async () => {
    mockApiGet.mockRejectedValueOnce(new Error('Server error'));

    render(
      <Providers>
        <AuditLogsPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument();
    });
  });

  it('shows fallback error message for non-Error throws', async () => {
    mockApiGet.mockRejectedValueOnce('string error');

    render(
      <Providers>
        <AuditLogsPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('Failed to load audit logs')).toBeInTheDocument();
    });
  });

  it('renders the action filter input', async () => {
    mockApiGet.mockResolvedValueOnce(mockLogsPage1);

    render(
      <Providers>
        <AuditLogsPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Filter by action...')).toBeInTheDocument();
    });
  });

  it('calls API with action filter parameter when filtering', async () => {
    mockApiGet.mockResolvedValueOnce(mockLogsPage1);

    render(
      <Providers>
        <AuditLogsPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('USER_ROLE_CHANGE')).toBeInTheDocument();
    });

    mockApiGet.mockResolvedValueOnce({
      data: [makeAuditLog({ id: 'log-1', action: 'USER_LOGIN' })],
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    });

    fireEvent.change(screen.getByPlaceholderText('Filter by action...'), {
      target: { value: 'USER_LOGIN' },
    });

    await waitFor(() => {
      const lastCall = mockApiGet.mock.calls.at(-1)?.[0] as string;
      expect(lastCall).toContain('action=USER_LOGIN');
    });
  });

  it('calls the correct API endpoint on mount', async () => {
    mockApiGet.mockResolvedValueOnce(mockLogsPage1);

    render(
      <Providers>
        <AuditLogsPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledWith(expect.stringContaining('/api/admin/audit-logs'));
    });
  });
});
