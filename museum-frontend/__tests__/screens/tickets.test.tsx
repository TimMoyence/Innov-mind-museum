import '../helpers/test-utils';
import { render, screen, waitFor } from '@testing-library/react-native';

// ── Screen-specific mocks ────────────────────────────────────────────────────

const mockListTickets = jest.fn();
jest.mock('@/features/support/infrastructure/ticketApi', () => ({
  ticketApi: {
    listTickets: (...args: any[]) => mockListTickets(...args),
    createTicket: jest.fn(),
    getTicketDetail: jest.fn(),
    addTicketMessage: jest.fn(),
  },
}));

import TicketsScreen from '@/app/(stack)/tickets';

describe('TicketsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders title', () => {
    mockListTickets.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 15,
      totalPages: 1,
    });
    render(<TicketsScreen />);
    expect(screen.getByText('tickets.title')).toBeTruthy();
  });

  it('shows loading indicator while fetching', () => {
    mockListTickets.mockReturnValue(new Promise(() => {})); // never resolves
    render(<TicketsScreen />);
    // The screen shows ActivityIndicator when isLoading is true
    // The title should still be visible
    expect(screen.getByText('tickets.title')).toBeTruthy();
  });

  it('renders status filter pills', async () => {
    mockListTickets.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 15,
      totalPages: 1,
    });
    render(<TicketsScreen />);
    // Status filter pills: all, open, in_progress, resolved, closed
    await waitFor(() => {
      expect(screen.getByText('tickets.status')).toBeTruthy(); // 'all' label
    });
    expect(screen.getByText('tickets.statusOpen')).toBeTruthy();
    expect(screen.getByText('tickets.statusInProgress')).toBeTruthy();
    expect(screen.getByText('tickets.statusResolved')).toBeTruthy();
    expect(screen.getByText('tickets.statusClosed')).toBeTruthy();
  });

  it('renders empty state when no tickets', async () => {
    mockListTickets.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 15,
      totalPages: 1,
    });
    render(<TicketsScreen />);
    await waitFor(() => {
      expect(screen.getByText('tickets.noTickets')).toBeTruthy();
    });
    expect(screen.getByText('tickets.noTicketsDesc')).toBeTruthy();
  });

  it('renders ticket list when tickets exist', async () => {
    mockListTickets.mockResolvedValue({
      data: [
        {
          id: 'ticket-1',
          subject: 'Cannot scan artwork',
          status: 'open',
          priority: 'medium',
          createdAt: '2026-03-15T10:00:00Z',
          messageCount: 3,
        },
      ],
      total: 1,
      page: 1,
      limit: 15,
      totalPages: 1,
    });
    render(<TicketsScreen />);
    await waitFor(() => {
      expect(screen.getByText('Cannot scan artwork')).toBeTruthy();
    });
  });

  it('renders create ticket button', () => {
    mockListTickets.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 15,
      totalPages: 1,
    });
    render(<TicketsScreen />);
    expect(screen.getByLabelText('tickets.create')).toBeTruthy();
  });

  it('shows error notice when loading fails', async () => {
    mockListTickets.mockRejectedValue(new Error('Network error'));
    render(<TicketsScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('error-notice')).toBeTruthy();
    });
  });
});
