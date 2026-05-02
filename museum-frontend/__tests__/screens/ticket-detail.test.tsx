import '../helpers/test-utils';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { makeSupportTicketDetail, makeTicketMessage } from '../helpers/factories/support.factories';

// ── Screen-specific mocks ────────────────────────────────────────────────────

// Override useLocalSearchParams from test-utils mock to provide a ticketId.
const mockExpoRouter = jest.requireMock<Record<string, unknown>>('expo-router');
mockExpoRouter.useLocalSearchParams = () => ({ ticketId: 'ticket-123' });

jest.mock('@/features/support/infrastructure/ticketApi', () => ({
  ticketApi: {
    listTickets: jest.fn(),
    createTicket: jest.fn(),
    getTicketDetail: jest.fn(),
    addTicketMessage: jest.fn(),
  },
}));

import TicketDetailScreen from '@/app/(stack)/ticket-detail';
import { ticketApi } from '@/features/support/infrastructure/ticketApi';

const mockGetTicketDetail = ticketApi.getTicketDetail as jest.Mock;
const mockAddTicketMessage = ticketApi.addTicketMessage as jest.Mock;

describe('TicketDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetTicketDetail.mockResolvedValue({
      ticket: makeSupportTicketDetail({
        id: 'ticket-123',
        subject: 'Cannot scan artwork',
        status: 'open',
        priority: 'medium',
        category: 'bug',
        messages: [
          makeTicketMessage({
            id: 'msg-1',
            ticketId: 'ticket-123',
            text: 'I cannot scan any artworks',
            senderRole: 'visitor',
          }),
          makeTicketMessage({
            id: 'msg-2',
            ticketId: 'ticket-123',
            text: 'We are looking into this',
            senderRole: 'staff',
          }),
        ],
      }),
    });
  });

  // ── Mount & loading ────────────────────────────────────────────────────────

  it('calls getTicketDetail with the ticketId from route params on mount', async () => {
    render(<TicketDetailScreen />);
    await waitFor(() => {
      expect(mockGetTicketDetail).toHaveBeenCalledWith('ticket-123');
    });
  });

  it('renders the ticket subject after loading', async () => {
    render(<TicketDetailScreen />);
    await waitFor(() => {
      expect(screen.getByText('Cannot scan artwork')).toBeTruthy();
    });
  });

  it('renders the optional category text when present', async () => {
    render(<TicketDetailScreen />);
    await waitFor(() => {
      expect(screen.getByText('bug')).toBeTruthy();
    });
  });

  it('omits the category line when category is null', async () => {
    mockGetTicketDetail.mockResolvedValue({
      ticket: makeSupportTicketDetail({
        id: 'ticket-123',
        subject: 'No category here',
        category: null,
        messages: [],
      }),
    });
    render(<TicketDetailScreen />);
    await waitFor(() => {
      expect(screen.getByText('No category here')).toBeTruthy();
    });
    expect(screen.queryByText('bug')).toBeNull();
  });

  // ── Status badge variants (open / in_progress / resolved / closed) ────────

  it('renders the open status badge label', async () => {
    render(<TicketDetailScreen />);
    await waitFor(() => {
      expect(screen.getByText('tickets.statusOpen')).toBeTruthy();
    });
  });

  it('renders the in_progress status badge label', async () => {
    mockGetTicketDetail.mockResolvedValue({
      ticket: makeSupportTicketDetail({ status: 'in_progress', messages: [] }),
    });
    render(<TicketDetailScreen />);
    await waitFor(() => {
      expect(screen.getByText('tickets.statusInProgress')).toBeTruthy();
    });
  });

  it('renders the resolved status badge label', async () => {
    mockGetTicketDetail.mockResolvedValue({
      ticket: makeSupportTicketDetail({ status: 'resolved', messages: [] }),
    });
    render(<TicketDetailScreen />);
    await waitFor(() => {
      expect(screen.getByText('tickets.statusResolved')).toBeTruthy();
    });
  });

  it('renders the closed status badge label', async () => {
    mockGetTicketDetail.mockResolvedValue({
      ticket: makeSupportTicketDetail({ status: 'closed', messages: [] }),
    });
    render(<TicketDetailScreen />);
    await waitFor(() => {
      expect(screen.getByText('tickets.statusClosed')).toBeTruthy();
    });
  });

  it('renders the priority badge text', async () => {
    render(<TicketDetailScreen />);
    await waitFor(() => {
      expect(screen.getByText('medium')).toBeTruthy();
    });
  });

  // ── Message thread ─────────────────────────────────────────────────────────

  it('renders both visitor and staff message bubbles in the thread', async () => {
    render(<TicketDetailScreen />);
    await waitFor(() => {
      expect(screen.getByText('I cannot scan any artworks')).toBeTruthy();
    });
    expect(screen.getByText('We are looking into this')).toBeTruthy();
  });

  it('renders the empty-thread placeholder when messages is empty', async () => {
    mockGetTicketDetail.mockResolvedValue({
      ticket: makeSupportTicketDetail({ messages: [] }),
    });
    render(<TicketDetailScreen />);
    await waitFor(() => {
      expect(screen.getByText('tickets.noMessages')).toBeTruthy();
    });
  });

  // ── Reply input + submit ───────────────────────────────────────────────────

  it('renders the reply input with placeholder and the send button', async () => {
    render(<TicketDetailScreen />);
    await waitFor(() => {
      expect(screen.getByLabelText('tickets.send')).toBeTruthy();
    });
    expect(screen.getByPlaceholderText('tickets.replyPlaceholder')).toBeTruthy();
  });

  it('does not call addTicketMessage when the reply text is blank', async () => {
    render(<TicketDetailScreen />);
    await waitFor(() => {
      expect(screen.getByLabelText('tickets.send')).toBeTruthy();
    });
    fireEvent.press(screen.getByLabelText('tickets.send'));
    expect(mockAddTicketMessage).not.toHaveBeenCalled();
  });

  it('does not call addTicketMessage when the reply text is whitespace-only', async () => {
    render(<TicketDetailScreen />);
    await waitFor(() => {
      expect(screen.getByLabelText('tickets.send')).toBeTruthy();
    });
    fireEvent.changeText(screen.getByPlaceholderText('tickets.replyPlaceholder'), '   ');
    fireEvent.press(screen.getByLabelText('tickets.send'));
    expect(mockAddTicketMessage).not.toHaveBeenCalled();
  });

  it('calls addTicketMessage with trimmed text when the user submits a reply', async () => {
    mockAddTicketMessage.mockResolvedValue({
      message: makeTicketMessage({ id: 'msg-3', text: 'My reply' }),
    });
    render(<TicketDetailScreen />);
    await waitFor(() => {
      expect(screen.getByLabelText('tickets.send')).toBeTruthy();
    });
    fireEvent.changeText(screen.getByPlaceholderText('tickets.replyPlaceholder'), '  My reply  ');
    fireEvent.press(screen.getByLabelText('tickets.send'));
    await waitFor(() => {
      expect(mockAddTicketMessage).toHaveBeenCalledWith('ticket-123', 'My reply');
    });
  });

  it('re-fetches the ticket detail after a successful reply submit', async () => {
    mockAddTicketMessage.mockResolvedValue({ message: makeTicketMessage({ id: 'msg-3' }) });
    render(<TicketDetailScreen />);
    await waitFor(() => {
      expect(mockGetTicketDetail).toHaveBeenCalledTimes(1);
    });
    fireEvent.changeText(screen.getByPlaceholderText('tickets.replyPlaceholder'), 'reply!');
    fireEvent.press(screen.getByLabelText('tickets.send'));
    await waitFor(() => {
      expect(mockGetTicketDetail).toHaveBeenCalledTimes(2);
    });
  });

  it('surfaces an inline error when sending a reply fails', async () => {
    mockAddTicketMessage.mockRejectedValue(new Error('Send failed'));
    render(<TicketDetailScreen />);
    await waitFor(() => {
      expect(screen.getByLabelText('tickets.send')).toBeTruthy();
    });
    fireEvent.changeText(screen.getByPlaceholderText('tickets.replyPlaceholder'), 'broken');
    fireEvent.press(screen.getByLabelText('tickets.send'));
    await waitFor(() => {
      expect(screen.getByText('Send failed')).toBeTruthy();
    });
  });

  // ── Error path on initial load ────────────────────────────────────────────

  it('shows the standalone error notice when initial load fails (no ticket yet)', async () => {
    mockGetTicketDetail.mockRejectedValue(new Error('Not found'));
    render(<TicketDetailScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('error-notice')).toBeTruthy();
    });
    expect(screen.getByText('Not found')).toBeTruthy();
  });
});
