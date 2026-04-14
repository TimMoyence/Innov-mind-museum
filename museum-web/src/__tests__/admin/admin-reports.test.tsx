/**
 * Admin reports page tests — report list, status filter, review modal, pagination, error handling.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthProvider } from '@/lib/auth';
import { AdminDictProvider } from '@/lib/admin-dictionary';
import ReportsPage from '@/app/[locale]/admin/reports/page';
import type { Report, PaginatedResponse } from '@/lib/admin-types';
import { mockAdminDict } from '../helpers/admin-dict.fixture';

// ── Next.js mocks ───────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  usePathname: () => '/en/admin/reports',
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

vi.mock('@/lib/api', () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args) as Promise<unknown>,
  apiPatch: (...args: unknown[]) => mockApiPatch(...args) as Promise<unknown>,
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

function makeReport(overrides: Partial<Report> = {}): Report {
  return {
    id: 'report-1',
    messageId: 'msg-1',
    userId: 42,
    reason: 'inappropriate',
    comment: null,
    status: 'pending',
    reviewedBy: null,
    reviewedAt: null,
    reviewerNotes: null,
    createdAt: '2025-06-01T10:00:00Z',
    messageText: 'This is an offensive message.',
    messageRole: 'assistant',
    sessionId: 'session-1',
    ...overrides,
  };
}

const mockReportsPage1: PaginatedResponse<Report> = {
  data: [
    makeReport({ id: 'r-1', reason: 'inappropriate', status: 'pending', userId: 42 }),
    makeReport({
      id: 'r-2',
      reason: 'spam',
      status: 'reviewed',
      userId: 99,
      messageText: 'Spam message content here',
    }),
    makeReport({
      id: 'r-3',
      reason: 'off-topic',
      status: 'dismissed',
      userId: 7,
      messageText: null,
    }),
  ],
  page: 1,
  limit: 20,
  total: 30,
  totalPages: 2,
};

// ============================================================================
// Reports page
// ============================================================================

describe('ReportsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the reports heading', () => {
    mockApiGet.mockResolvedValueOnce(mockReportsPage1);

    render(
      <Providers>
        <ReportsPage />
      </Providers>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Reports' })).toBeInTheDocument();
  });

  it('shows loading spinner while fetching data', () => {
    mockApiGet.mockReturnValue(
      new Promise(() => {
        /* pending */
      }),
    );

    render(
      <Providers>
        <ReportsPage />
      </Providers>,
    );

    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('renders report entries with reason, status, and user', async () => {
    mockApiGet.mockResolvedValueOnce(mockReportsPage1);

    render(
      <Providers>
        <ReportsPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('inappropriate')).toBeInTheDocument();
    });

    expect(screen.getByText('spam')).toBeInTheDocument();
    expect(screen.getByText('off-topic')).toBeInTheDocument();
    // Statuses appear both in the table and in the filter dropdown options
    expect(screen.getAllByText('pending').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('reviewed').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('dismissed').length).toBeGreaterThanOrEqual(1);
  });

  it('renders table column headers', async () => {
    mockApiGet.mockResolvedValueOnce(mockReportsPage1);

    render(
      <Providers>
        <ReportsPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('inappropriate')).toBeInTheDocument();
    });

    expect(screen.getByText('Date')).toBeInTheDocument();
    expect(screen.getByText('User')).toBeInTheDocument();
    expect(screen.getByText('Reason')).toBeInTheDocument();
    expect(screen.getByText('Message')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
  });

  it('truncates long message text to 100 characters', async () => {
    const longMessage = 'A'.repeat(120);
    mockApiGet.mockResolvedValueOnce({
      data: [makeReport({ id: 'r-long', messageText: longMessage })],
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    });

    render(
      <Providers>
        <ReportsPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('A'.repeat(100) + '...')).toBeInTheDocument();
    });
  });

  it('shows dash for null messageText', async () => {
    mockApiGet.mockResolvedValueOnce(mockReportsPage1);

    render(
      <Providers>
        <ReportsPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('off-topic')).toBeInTheDocument();
    });

    const dashes = screen.getAllByText('\u2014');
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it('renders status filter dropdown with All statuses option', async () => {
    mockApiGet.mockResolvedValueOnce(mockReportsPage1);

    render(
      <Providers>
        <ReportsPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('All statuses')).toBeInTheDocument();
    });
  });

  it('renders pagination when totalPages > 1', async () => {
    mockApiGet.mockResolvedValueOnce(mockReportsPage1);

    render(
      <Providers>
        <ReportsPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('inappropriate')).toBeInTheDocument();
    });

    expect(screen.getByText('Previous')).toBeInTheDocument();
    expect(screen.getByText('Next')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 2 (30 total)')).toBeInTheDocument();
  });

  it('shows empty state when no reports found', async () => {
    mockApiGet.mockResolvedValueOnce({
      data: [],
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
    });

    render(
      <Providers>
        <ReportsPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('No reports')).toBeInTheDocument();
    });
  });

  it('opens review modal when Review button is clicked', async () => {
    mockApiGet.mockResolvedValueOnce(mockReportsPage1);

    render(
      <Providers>
        <ReportsPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('inappropriate')).toBeInTheDocument();
    });

    const reviewButtons = screen.getAllByText('Review');
    fireEvent.click(reviewButtons[0]);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    expect(screen.getByText('Review Report')).toBeInTheDocument();
    expect(screen.getByText('Reported message')).toBeInTheDocument();
  });

  it('closes review modal when Cancel is clicked', async () => {
    mockApiGet.mockResolvedValueOnce(mockReportsPage1);

    render(
      <Providers>
        <ReportsPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('inappropriate')).toBeInTheDocument();
    });

    const reviewButtons = screen.getAllByText('Review');
    fireEvent.click(reviewButtons[0]);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Cancel'));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('submits review via apiPatch and re-fetches', async () => {
    mockApiGet.mockResolvedValueOnce(mockReportsPage1);

    render(
      <Providers>
        <ReportsPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('inappropriate')).toBeInTheDocument();
    });

    const reviewButtons = screen.getAllByText('Review');
    fireEvent.click(reviewButtons[0]);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    mockApiPatch.mockResolvedValueOnce({});
    mockApiGet.mockResolvedValueOnce(mockReportsPage1);

    fireEvent.click(screen.getByText('Confirm'));

    await waitFor(() => {
      expect(mockApiPatch).toHaveBeenCalledWith('/api/admin/reports/r-1', {
        status: 'reviewed',
        reviewerNotes: '',
      });
    });
  });

  it('handles API error gracefully', async () => {
    mockApiGet.mockRejectedValueOnce(new Error('Network error'));

    render(
      <Providers>
        <ReportsPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('shows fallback error message for non-Error throws', async () => {
    mockApiGet.mockRejectedValueOnce('oops');

    render(
      <Providers>
        <ReportsPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('Failed to load reports')).toBeInTheDocument();
    });
  });

  it('calls the correct API endpoint on mount', async () => {
    mockApiGet.mockResolvedValueOnce(mockReportsPage1);

    render(
      <Providers>
        <ReportsPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledWith(expect.stringContaining('/api/admin/reports'));
    });
  });

  it('calls API with status filter when changed', async () => {
    mockApiGet.mockResolvedValueOnce(mockReportsPage1);

    render(
      <Providers>
        <ReportsPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('inappropriate')).toBeInTheDocument();
    });

    mockApiGet.mockResolvedValueOnce({
      data: [makeReport({ id: 'r-2', status: 'reviewed' })],
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    });

    fireEvent.change(screen.getByDisplayValue('All statuses'), {
      target: { value: 'reviewed' },
    });

    await waitFor(() => {
      const lastCall = mockApiGet.mock.calls.at(-1)?.[0] as string;
      expect(lastCall).toContain('status=reviewed');
    });
  });
});
