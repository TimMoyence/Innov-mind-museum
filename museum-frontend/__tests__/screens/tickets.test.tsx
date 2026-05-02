import '../helpers/test-utils';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { makeSupportTicket } from '../helpers/factories/support.factories';

// ── Screen-specific mocks ────────────────────────────────────────────────────

const mockListTickets = jest.fn();
jest.mock('@/features/support/infrastructure/ticketApi', () => ({
  ticketApi: {
    listTickets: (...args: unknown[]) => mockListTickets(...args),
    createTicket: jest.fn(),
    getTicketDetail: jest.fn(),
    addTicketMessage: jest.fn(),
  },
}));

import TicketsScreen from '@/app/(stack)/tickets';
import { router } from 'expo-router';

const mockRouterPush = router.push as jest.Mock;

const emptyPage = () => ({
  data: [],
  total: 0,
  page: 1,
  limit: 15,
  totalPages: 1,
});

const pageWith = (
  tickets: ReturnType<typeof makeSupportTicket>[],
  pageNum = 1,
  totalPages = 1,
) => ({
  data: tickets,
  total: tickets.length,
  page: pageNum,
  limit: 15,
  totalPages,
});

describe('TicketsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Header & filters ───────────────────────────────────────────────────────

  it('renders the screen title from the i18n key', () => {
    mockListTickets.mockResolvedValue(emptyPage());
    render(<TicketsScreen />);
    expect(screen.getByText('tickets.title')).toBeTruthy();
  });

  it('renders all five status filter pills (all + 4 statuses)', async () => {
    mockListTickets.mockResolvedValue(emptyPage());
    render(<TicketsScreen />);
    await waitFor(() => {
      expect(screen.getByText('tickets.status')).toBeTruthy();
    });
    expect(screen.getByText('tickets.statusOpen')).toBeTruthy();
    expect(screen.getByText('tickets.statusInProgress')).toBeTruthy();
    expect(screen.getByText('tickets.statusResolved')).toBeTruthy();
    expect(screen.getByText('tickets.statusClosed')).toBeTruthy();
  });

  it('first listTickets call uses no status filter (all)', async () => {
    mockListTickets.mockResolvedValue(emptyPage());
    render(<TicketsScreen />);
    await waitFor(() => {
      expect(mockListTickets).toHaveBeenCalledWith({
        page: 1,
        limit: 15,
        status: undefined,
      });
    });
  });

  it('pressing a status filter pill triggers a re-fetch with that status', async () => {
    mockListTickets.mockResolvedValue(emptyPage());
    render(<TicketsScreen />);
    await waitFor(() => {
      expect(mockListTickets).toHaveBeenCalledTimes(1);
    });
    fireEvent.press(screen.getByText('tickets.statusOpen'));
    await waitFor(() => {
      expect(mockListTickets).toHaveBeenCalledWith({
        page: 1,
        limit: 15,
        status: 'open',
      });
    });
  });

  it('pressing the resolved pill re-fetches with status=resolved', async () => {
    mockListTickets.mockResolvedValue(emptyPage());
    render(<TicketsScreen />);
    await waitFor(() => {
      expect(mockListTickets).toHaveBeenCalledTimes(1);
    });
    fireEvent.press(screen.getByText('tickets.statusResolved'));
    await waitFor(() => {
      expect(mockListTickets).toHaveBeenLastCalledWith({
        page: 1,
        limit: 15,
        status: 'resolved',
      });
    });
  });

  // ── Loading & empty state ──────────────────────────────────────────────────

  it('does not render the empty state while the initial fetch is pending', () => {
    mockListTickets.mockReturnValue(new Promise(() => undefined));
    render(<TicketsScreen />);
    expect(screen.queryByText('tickets.noTickets')).toBeNull();
  });

  it('renders the empty state title + description when the list is empty', async () => {
    mockListTickets.mockResolvedValue(emptyPage());
    render(<TicketsScreen />);
    await waitFor(() => {
      expect(screen.getByText('tickets.noTickets')).toBeTruthy();
    });
    expect(screen.getByText('tickets.noTicketsDesc')).toBeTruthy();
    expect(screen.getByText('tickets.createFirst')).toBeTruthy();
  });

  it('empty-state "createFirst" button navigates to the create-ticket screen', async () => {
    mockListTickets.mockResolvedValue(emptyPage());
    render(<TicketsScreen />);
    await waitFor(() => {
      expect(screen.getByText('tickets.createFirst')).toBeTruthy();
    });
    fireEvent.press(screen.getByText('tickets.createFirst'));
    expect(mockRouterPush).toHaveBeenCalledWith('/(stack)/create-ticket');
  });

  // ── List rendering ─────────────────────────────────────────────────────────

  it('renders a ticket row with subject, status label, priority and message count', async () => {
    mockListTickets.mockResolvedValue(
      pageWith([
        makeSupportTicket({
          id: 'ticket-A',
          subject: 'Cannot scan artwork',
          status: 'open',
          priority: 'high',
          messageCount: 3,
        }),
      ]),
    );
    render(<TicketsScreen />);
    await waitFor(() => {
      expect(screen.getByText('Cannot scan artwork')).toBeTruthy();
    });
    // Label appears once in the filter pill row + once in the row's status badge.
    expect(screen.getAllByText('tickets.statusOpen').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('high')).toBeTruthy();
    expect(screen.getByText(/tickets\.messages.*3/)).toBeTruthy();
  });

  it('renders multiple ticket rows in the order returned by the API', async () => {
    mockListTickets.mockResolvedValue(
      pageWith([
        makeSupportTicket({ id: 't1', subject: 'First subject' }),
        makeSupportTicket({ id: 't2', subject: 'Second subject', status: 'closed' }),
      ]),
    );
    render(<TicketsScreen />);
    await waitFor(() => {
      expect(screen.getByText('First subject')).toBeTruthy();
    });
    expect(screen.getByText('Second subject')).toBeTruthy();
    // Closed status badge present on the second row in addition to the filter pill.
    expect(screen.getAllByText('tickets.statusClosed').length).toBeGreaterThanOrEqual(2);
  });

  it('pressing a ticket row navigates to ticket-detail with the ticketId param', async () => {
    mockListTickets.mockResolvedValue(
      pageWith([makeSupportTicket({ id: 'ticket-XYZ', subject: 'Pick me' })]),
    );
    render(<TicketsScreen />);
    await waitFor(() => {
      expect(screen.getByLabelText('Pick me')).toBeTruthy();
    });
    fireEvent.press(screen.getByLabelText('Pick me'));
    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/(stack)/ticket-detail',
      params: { ticketId: 'ticket-XYZ' },
    });
  });

  it('omits the message count meta when messageCount is undefined', async () => {
    mockListTickets.mockResolvedValue(
      pageWith([makeSupportTicket({ id: 't', subject: 'No count', messageCount: undefined })]),
    );
    render(<TicketsScreen />);
    await waitFor(() => {
      expect(screen.getByText('No count')).toBeTruthy();
    });
    expect(screen.queryByText(/tickets\.messages/)).toBeNull();
  });

  // ── FAB / create CTA ───────────────────────────────────────────────────────

  it('renders the create-ticket primary button with i18n a11y label', () => {
    mockListTickets.mockResolvedValue(emptyPage());
    render(<TicketsScreen />);
    expect(screen.getByLabelText('tickets.create')).toBeTruthy();
  });

  it('pressing the create-ticket primary button navigates to /(stack)/create-ticket', async () => {
    mockListTickets.mockResolvedValue(emptyPage());
    render(<TicketsScreen />);
    await waitFor(() => {
      expect(screen.getByLabelText('tickets.create')).toBeTruthy();
    });
    fireEvent.press(screen.getByLabelText('tickets.create'));
    expect(mockRouterPush).toHaveBeenCalledWith('/(stack)/create-ticket');
  });

  // ── Error path ─────────────────────────────────────────────────────────────

  it('shows the error notice with the thrown error message when loading fails', async () => {
    mockListTickets.mockRejectedValue(new Error('Network down'));
    render(<TicketsScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('error-notice')).toBeTruthy();
    });
    expect(screen.getByText('Network down')).toBeTruthy();
  });

  it('clearing the error via dismiss removes the error notice', async () => {
    mockListTickets.mockRejectedValue(new Error('Network down'));
    render(<TicketsScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('error-notice')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('error-notice-dismiss'));
    await waitFor(() => {
      expect(screen.queryByTestId('error-notice')).toBeNull();
    });
  });
});
