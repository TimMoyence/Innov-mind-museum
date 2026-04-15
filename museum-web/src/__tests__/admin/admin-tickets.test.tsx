/**
 * Admin tickets page tests — ticket list, status/priority filters, update modal, pagination, error handling.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthProvider } from '@/lib/auth';
import { AdminDictProvider } from '@/lib/admin-dictionary';
import TicketsPage from '@/app/[locale]/admin/tickets/page';
import type { Ticket, PaginatedResponse } from '@/lib/admin-types';
import { mockAdminDict } from '../helpers/admin-dict.fixture';

// ── Next.js mocks ───────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  usePathname: () => '/en/admin/tickets',
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
    <AdminDictProvider dict={mockAdminDict} locale="en">
      <AuthProvider>{children}</AuthProvider>
    </AdminDictProvider>
  );
}

// ── Test data ───────────────────────────────────────────────────────────────

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: 'ticket-1',
    userId: 42,
    subject: 'Cannot upload photo',
    description: 'The photo upload fails repeatedly.',
    status: 'open',
    priority: 'high',
    category: 'bug',
    assignedTo: null,
    createdAt: '2025-06-01T08:00:00Z',
    updatedAt: '2025-06-01T08:00:00Z',
    messageCount: 3,
    ...overrides,
  };
}

const mockTicketsPage1: PaginatedResponse<Ticket> = {
  data: [
    makeTicket({
      id: 't-1',
      subject: 'Cannot upload photo',
      status: 'open',
      priority: 'high',
      messageCount: 3,
    }),
    makeTicket({
      id: 't-2',
      subject: 'Wrong artwork info',
      status: 'in_progress',
      priority: 'medium',
      userId: 99,
      messageCount: 1,
    }),
    makeTicket({
      id: 't-3',
      subject: 'App crash on startup',
      status: 'resolved',
      priority: 'low',
      userId: 7,
      messageCount: 0,
    }),
  ],
  page: 1,
  limit: 20,
  total: 50,
  totalPages: 3,
};

// ============================================================================
// Tickets page
// ============================================================================

describe('TicketsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the tickets heading', () => {
    mockApiGet.mockResolvedValueOnce(mockTicketsPage1);

    render(
      <Providers>
        <TicketsPage />
      </Providers>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Tickets' })).toBeInTheDocument();
  });

  it('shows loading spinner while fetching data', () => {
    mockApiGet.mockReturnValue(
      new Promise(() => {
        /* pending */
      }),
    );

    render(
      <Providers>
        <TicketsPage />
      </Providers>,
    );

    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('renders ticket entries with subject, status, and priority', async () => {
    mockApiGet.mockResolvedValueOnce(mockTicketsPage1);

    render(
      <Providers>
        <TicketsPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('Cannot upload photo')).toBeInTheDocument();
    });

    expect(screen.getByText('Wrong artwork info')).toBeInTheDocument();
    expect(screen.getByText('App crash on startup')).toBeInTheDocument();
    // Statuses and priorities appear both in the table and in the filter dropdown options
    expect(screen.getAllByText('open').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('in_progress').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('resolved').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('high').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('medium').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('low').length).toBeGreaterThanOrEqual(1);
  });

  it('renders table column headers', async () => {
    mockApiGet.mockResolvedValueOnce(mockTicketsPage1);

    render(
      <Providers>
        <TicketsPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('Cannot upload photo')).toBeInTheDocument();
    });

    expect(screen.getByText('Date')).toBeInTheDocument();
    expect(screen.getByText('Subject')).toBeInTheDocument();
    expect(screen.getByText('User')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Priority')).toBeInTheDocument();
    expect(screen.getByText('Messages')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
  });

  it('displays message count for each ticket', async () => {
    mockApiGet.mockResolvedValueOnce(mockTicketsPage1);

    render(
      <Providers>
        <TicketsPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('Cannot upload photo')).toBeInTheDocument();
    });

    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('renders status and priority filter dropdowns', async () => {
    mockApiGet.mockResolvedValueOnce(mockTicketsPage1);

    render(
      <Providers>
        <TicketsPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('All statuses')).toBeInTheDocument();
    });

    expect(screen.getByDisplayValue('All priorities')).toBeInTheDocument();
  });

  it('renders Update and View buttons for each ticket', async () => {
    mockApiGet.mockResolvedValueOnce(mockTicketsPage1);

    render(
      <Providers>
        <TicketsPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('Cannot upload photo')).toBeInTheDocument();
    });

    const updateButtons = screen.getAllByText('Update');
    expect(updateButtons.length).toBe(3);

    const viewButtons = screen.getAllByText('View');
    expect(viewButtons.length).toBe(3);
  });

  it('renders pagination when totalPages > 1', async () => {
    mockApiGet.mockResolvedValueOnce(mockTicketsPage1);

    render(
      <Providers>
        <TicketsPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('Cannot upload photo')).toBeInTheDocument();
    });

    expect(screen.getByText('Previous')).toBeInTheDocument();
    expect(screen.getByText('Next')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 3 (50 total)')).toBeInTheDocument();
  });

  it('previous button is disabled on first page', async () => {
    mockApiGet.mockResolvedValueOnce(mockTicketsPage1);

    render(
      <Providers>
        <TicketsPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('Cannot upload photo')).toBeInTheDocument();
    });

    expect(screen.getByText('Previous')).toBeDisabled();
    expect(screen.getByText('Next')).not.toBeDisabled();
  });

  it('shows empty state when no tickets found', async () => {
    mockApiGet.mockResolvedValueOnce({
      data: [],
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
    });

    render(
      <Providers>
        <TicketsPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('No tickets')).toBeInTheDocument();
    });
  });

  it('opens update modal when Update button is clicked', async () => {
    mockApiGet.mockResolvedValueOnce(mockTicketsPage1);

    render(
      <Providers>
        <TicketsPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('Cannot upload photo')).toBeInTheDocument();
    });

    const updateButtons = screen.getAllByText('Update');
    fireEvent.click(updateButtons[0]);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    expect(screen.getByText('Update Ticket')).toBeInTheDocument();
    // Modal shows the ticket subject
    expect(screen.getAllByText('Cannot upload photo').length).toBeGreaterThanOrEqual(1);
  });

  it('confirm button is disabled when status and priority have not changed', async () => {
    mockApiGet.mockResolvedValueOnce(mockTicketsPage1);

    render(
      <Providers>
        <TicketsPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('Cannot upload photo')).toBeInTheDocument();
    });

    const updateButtons = screen.getAllByText('Update');
    fireEvent.click(updateButtons[0]);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Confirm is disabled because status=open and priority=high haven't changed
    expect(screen.getByText('Confirm')).toBeDisabled();
  });

  it('closes update modal when Cancel is clicked', async () => {
    mockApiGet.mockResolvedValueOnce(mockTicketsPage1);

    render(
      <Providers>
        <TicketsPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('Cannot upload photo')).toBeInTheDocument();
    });

    const updateButtons = screen.getAllByText('Update');
    fireEvent.click(updateButtons[0]);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Cancel'));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('submits update via apiPatch when status is changed', async () => {
    mockApiGet.mockResolvedValueOnce(mockTicketsPage1);

    render(
      <Providers>
        <TicketsPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('Cannot upload photo')).toBeInTheDocument();
    });

    const updateButtons = screen.getAllByText('Update');
    fireEvent.click(updateButtons[0]);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Change the status in the modal
    const statusSelects = screen.getByRole('dialog').querySelectorAll('select');
    fireEvent.change(statusSelects[0], { target: { value: 'resolved' } });

    mockApiPatch.mockResolvedValueOnce({});
    mockApiGet.mockResolvedValueOnce(mockTicketsPage1);

    fireEvent.click(screen.getByText('Confirm'));

    await waitFor(() => {
      expect(mockApiPatch).toHaveBeenCalledWith('/api/admin/tickets/t-1', {
        status: 'resolved',
        priority: 'high',
      });
    });
  });

  it('handles API error gracefully', async () => {
    mockApiGet.mockRejectedValueOnce(new Error('Server error'));

    render(
      <Providers>
        <TicketsPage />
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
        <TicketsPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('Failed to load tickets')).toBeInTheDocument();
    });
  });

  it('calls API with status filter when changed', async () => {
    mockApiGet.mockResolvedValueOnce(mockTicketsPage1);

    render(
      <Providers>
        <TicketsPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('Cannot upload photo')).toBeInTheDocument();
    });

    mockApiGet.mockResolvedValueOnce({
      data: [makeTicket({ id: 't-2', status: 'in_progress' })],
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    });

    fireEvent.change(screen.getByDisplayValue('All statuses'), {
      target: { value: 'in_progress' },
    });

    await waitFor(() => {
      const lastCall = mockApiGet.mock.calls.at(-1)?.[0] as string;
      expect(lastCall).toContain('status=in_progress');
    });
  });

  it('calls API with priority filter when changed', async () => {
    mockApiGet.mockResolvedValueOnce(mockTicketsPage1);

    render(
      <Providers>
        <TicketsPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('Cannot upload photo')).toBeInTheDocument();
    });

    mockApiGet.mockResolvedValueOnce({
      data: [makeTicket({ id: 't-1', priority: 'high' })],
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    });

    fireEvent.change(screen.getByDisplayValue('All priorities'), {
      target: { value: 'high' },
    });

    await waitFor(() => {
      const lastCall = mockApiGet.mock.calls.at(-1)?.[0] as string;
      expect(lastCall).toContain('priority=high');
    });
  });

  it('calls the correct API endpoint on mount', async () => {
    mockApiGet.mockResolvedValueOnce(mockTicketsPage1);

    render(
      <Providers>
        <TicketsPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledWith(expect.stringContaining('/api/admin/tickets'));
    });
  });
});
