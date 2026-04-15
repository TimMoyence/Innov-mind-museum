/**
 * Admin support page tests — no-ticket state, ticket detail, messages thread, reply form, error handling.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthProvider } from '@/lib/auth';
import { AdminDictProvider } from '@/lib/admin-dictionary';
import AdminSupportPage from '@/app/[locale]/admin/support/page';
import type { TicketDetail } from '@/lib/admin-types';
import { mockAdminDict } from '../helpers/admin-dict.fixture';

// ── Next.js mocks ───────────────────────────────────────────────────────────

const mockSearchParamsGet = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => '/en/admin/support',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => ({
    get: (key: string) => mockSearchParamsGet(key) as string | null,
  }),
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
const mockApiPost = vi.fn();

vi.mock('@/lib/api', () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args) as Promise<unknown>,
  apiPost: (...args: unknown[]) => mockApiPost(...args) as Promise<unknown>,
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

const mockTicketDetail: TicketDetail = {
  id: 'ticket-1',
  userId: 42,
  subject: 'Cannot upload photo',
  description: 'The photo upload fails with a 500 error.',
  status: 'open',
  priority: 'high',
  category: 'bug',
  assignedTo: null,
  createdAt: '2025-06-01T08:00:00Z',
  updatedAt: '2025-06-01T08:00:00Z',
  messages: [
    {
      id: 'msg-1',
      ticketId: 'ticket-1',
      senderId: 42,
      senderRole: 'visitor',
      text: 'I keep getting errors when uploading photos.',
      createdAt: '2025-06-01T08:05:00Z',
    },
    {
      id: 'msg-2',
      ticketId: 'ticket-1',
      senderId: 1,
      senderRole: 'admin',
      text: 'We are investigating this issue.',
      createdAt: '2025-06-01T09:00:00Z',
    },
  ],
};

// ============================================================================
// Support page
// ============================================================================

describe('AdminSupportPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── No ticket selected ────────────────────────────────────────────────────

  describe('when no ticket is selected', () => {
    beforeEach(() => {
      mockSearchParamsGet.mockReturnValue(null);
    });

    it('renders the support heading', () => {
      render(
        <Providers>
          <AdminSupportPage />
        </Providers>,
      );

      expect(screen.getByRole('heading', { level: 1, name: 'Support' })).toBeInTheDocument();
    });

    it('shows "Select a ticket" prompt', () => {
      render(
        <Providers>
          <AdminSupportPage />
        </Providers>,
      );

      expect(screen.getByText('Select a ticket')).toBeInTheDocument();
    });

    it('renders View Tickets link', () => {
      render(
        <Providers>
          <AdminSupportPage />
        </Providers>,
      );

      const link = screen.getByText('View Tickets');
      expect(link).toBeInTheDocument();
      expect(link.closest('a')).toHaveAttribute('href', '/en/admin/tickets');
    });
  });

  // ── Ticket loading ────────────────────────────────────────────────────────

  describe('when ticket is loading', () => {
    beforeEach(() => {
      mockSearchParamsGet.mockImplementation((key: string) =>
        key === 'ticket' ? 'ticket-1' : null,
      );
    });

    it('shows loading spinner while fetching ticket', () => {
      mockApiGet.mockReturnValue(
        new Promise(() => {
          /* pending */
        }),
      );

      render(
        <Providers>
          <AdminSupportPage />
        </Providers>,
      );

      const spinner = document.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });
  });

  // ── Ticket loaded ─────────────────────────────────────────────────────────

  describe('when ticket is loaded', () => {
    beforeEach(() => {
      mockSearchParamsGet.mockImplementation((key: string) =>
        key === 'ticket' ? 'ticket-1' : null,
      );
    });

    it('renders ticket subject and metadata', async () => {
      mockApiGet.mockResolvedValueOnce({ ticket: mockTicketDetail });

      render(
        <Providers>
          <AdminSupportPage />
        </Providers>,
      );

      await waitFor(() => {
        expect(screen.getByText('Cannot upload photo')).toBeInTheDocument();
      });

      expect(screen.getByText('open')).toBeInTheDocument();
      expect(screen.getByText('high')).toBeInTheDocument();
      expect(screen.getByText('The photo upload fails with a 500 error.')).toBeInTheDocument();
    });

    it('renders back link to tickets page', async () => {
      mockApiGet.mockResolvedValueOnce({ ticket: mockTicketDetail });

      render(
        <Providers>
          <AdminSupportPage />
        </Providers>,
      );

      await waitFor(() => {
        expect(screen.getByText('Cannot upload photo')).toBeInTheDocument();
      });

      const backLink = screen.getByText(/Back/);
      expect(backLink.closest('a')).toHaveAttribute('href', '/en/admin/tickets');
    });

    it('renders message thread with sender roles', async () => {
      mockApiGet.mockResolvedValueOnce({ ticket: mockTicketDetail });

      render(
        <Providers>
          <AdminSupportPage />
        </Providers>,
      );

      await waitFor(() => {
        expect(
          screen.getByText('I keep getting errors when uploading photos.'),
        ).toBeInTheDocument();
      });

      expect(screen.getByText('We are investigating this issue.')).toBeInTheDocument();
      expect(screen.getByText('visitor')).toBeInTheDocument();
      expect(screen.getByText('admin')).toBeInTheDocument();
    });

    it('shows message count in thread header', async () => {
      mockApiGet.mockResolvedValueOnce({ ticket: mockTicketDetail });

      render(
        <Providers>
          <AdminSupportPage />
        </Providers>,
      );

      await waitFor(() => {
        expect(screen.getByText('Messages (2)')).toBeInTheDocument();
      });
    });

    it('shows "No messages" when message list is empty', async () => {
      mockApiGet.mockResolvedValueOnce({
        ticket: { ...mockTicketDetail, messages: [] },
      });

      render(
        <Providers>
          <AdminSupportPage />
        </Providers>,
      );

      await waitFor(() => {
        expect(screen.getByText('No messages')).toBeInTheDocument();
      });
    });

    it('renders reply form with textarea and send button', async () => {
      mockApiGet.mockResolvedValueOnce({ ticket: mockTicketDetail });

      render(
        <Providers>
          <AdminSupportPage />
        </Providers>,
      );

      await waitFor(() => {
        expect(screen.getByText('Cannot upload photo')).toBeInTheDocument();
      });

      expect(screen.getByPlaceholderText('Type your reply...')).toBeInTheDocument();
      expect(screen.getByText('Send')).toBeInTheDocument();
    });

    it('send button is disabled when reply text is empty', async () => {
      mockApiGet.mockResolvedValueOnce({ ticket: mockTicketDetail });

      render(
        <Providers>
          <AdminSupportPage />
        </Providers>,
      );

      await waitFor(() => {
        expect(screen.getByText('Cannot upload photo')).toBeInTheDocument();
      });

      expect(screen.getByText('Send')).toBeDisabled();
    });

    it('sends reply via apiPost when Send is clicked', async () => {
      mockApiGet.mockResolvedValueOnce({ ticket: mockTicketDetail });

      render(
        <Providers>
          <AdminSupportPage />
        </Providers>,
      );

      await waitFor(() => {
        expect(screen.getByText('Cannot upload photo')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByPlaceholderText('Type your reply...'), {
        target: { value: 'We have fixed the issue.' },
      });

      mockApiPost.mockResolvedValueOnce({});
      mockApiGet.mockResolvedValueOnce({ ticket: mockTicketDetail });

      fireEvent.click(screen.getByText('Send'));

      await waitFor(() => {
        expect(mockApiPost).toHaveBeenCalledWith('/api/support/tickets/ticket-1/messages', {
          text: 'We have fixed the issue.',
        });
      });
    });

    it('clears reply text after successful send', async () => {
      mockApiGet.mockResolvedValueOnce({ ticket: mockTicketDetail });

      render(
        <Providers>
          <AdminSupportPage />
        </Providers>,
      );

      await waitFor(() => {
        expect(screen.getByText('Cannot upload photo')).toBeInTheDocument();
      });

      const textarea = screen.getByPlaceholderText('Type your reply...');
      fireEvent.change(textarea, { target: { value: 'Fixed.' } });

      mockApiPost.mockResolvedValueOnce({});
      mockApiGet.mockResolvedValueOnce({ ticket: mockTicketDetail });

      fireEvent.click(screen.getByText('Send'));

      await waitFor(() => {
        expect(textarea).toHaveValue('');
      });
    });

    it('calls the correct API endpoint to fetch ticket', async () => {
      mockApiGet.mockResolvedValueOnce({ ticket: mockTicketDetail });

      render(
        <Providers>
          <AdminSupportPage />
        </Providers>,
      );

      await waitFor(() => {
        expect(mockApiGet).toHaveBeenCalledWith('/api/support/tickets/ticket-1');
      });
    });
  });

  // ── Error states ──────────────────────────────────────────────────────────

  describe('error handling', () => {
    beforeEach(() => {
      mockSearchParamsGet.mockImplementation((key: string) =>
        key === 'ticket' ? 'ticket-1' : null,
      );
    });

    it('shows error message when ticket fetch fails', async () => {
      mockApiGet.mockRejectedValueOnce(new Error('Ticket not found'));

      render(
        <Providers>
          <AdminSupportPage />
        </Providers>,
      );

      await waitFor(() => {
        expect(screen.getByText('Ticket not found')).toBeInTheDocument();
      });
    });

    it('shows fallback error for non-Error throws', async () => {
      mockApiGet.mockRejectedValueOnce('unknown');

      render(
        <Providers>
          <AdminSupportPage />
        </Providers>,
      );

      await waitFor(() => {
        expect(screen.getByText('Failed to load ticket')).toBeInTheDocument();
      });
    });

    it('renders back link on error state', async () => {
      mockApiGet.mockRejectedValueOnce(new Error('Not found'));

      render(
        <Providers>
          <AdminSupportPage />
        </Providers>,
      );

      await waitFor(() => {
        expect(screen.getByText('Not found')).toBeInTheDocument();
      });

      const backLink = screen.getByText(/Back/);
      expect(backLink.closest('a')).toHaveAttribute('href', '/en/admin/tickets');
    });
  });
});
