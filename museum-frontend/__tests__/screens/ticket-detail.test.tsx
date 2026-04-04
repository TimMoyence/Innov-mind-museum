import '../helpers/test-utils';
import { render, screen, waitFor } from '@testing-library/react-native';

// ── Screen-specific mocks ────────────────────────────────────────────────────

// Override useLocalSearchParams from test-utils mock for this screen
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

const makeTicketDetail = () => ({
  id: 'ticket-123',
  subject: 'Cannot scan artwork',
  status: 'open' as const,
  priority: 'medium' as const,
  category: 'bug',
  createdAt: '2026-03-15T10:00:00Z',
  messages: [
    {
      id: 'msg-1',
      text: 'I cannot scan any artworks',
      senderRole: 'visitor' as const,
      createdAt: '2026-03-15T10:00:00Z',
    },
    {
      id: 'msg-2',
      text: 'We are looking into this',
      senderRole: 'staff' as const,
      createdAt: '2026-03-15T11:00:00Z',
    },
  ],
});

describe('TicketDetailScreen', () => {
  beforeEach(() => {
    mockGetTicketDetail.mockResolvedValue({ ticket: makeTicketDetail() });
  });

  it('calls getTicketDetail on mount', async () => {
    render(<TicketDetailScreen />);
    await waitFor(() => {
      expect(mockGetTicketDetail).toHaveBeenCalledWith('ticket-123');
    });
  });

  it('renders ticket subject after loading', async () => {
    render(<TicketDetailScreen />);
    await waitFor(() => {
      expect(screen.getByText('Cannot scan artwork')).toBeTruthy();
    });
  });

  it('renders status badge', async () => {
    render(<TicketDetailScreen />);
    await waitFor(() => {
      expect(screen.getByText('tickets.statusOpen')).toBeTruthy();
    });
  });

  it('renders priority badge', async () => {
    render(<TicketDetailScreen />);
    await waitFor(() => {
      expect(screen.getByText('medium')).toBeTruthy();
    });
  });

  it('renders messages from thread', async () => {
    render(<TicketDetailScreen />);
    await waitFor(() => {
      expect(screen.getByText('I cannot scan any artworks')).toBeTruthy();
    });
    expect(screen.getByText('We are looking into this')).toBeTruthy();
  });

  it('renders reply input and send button', async () => {
    render(<TicketDetailScreen />);
    await waitFor(() => {
      expect(screen.getByLabelText('tickets.send')).toBeTruthy();
    });
  });

  it('renders category when present', async () => {
    render(<TicketDetailScreen />);
    await waitFor(() => {
      expect(screen.getByText('bug')).toBeTruthy();
    });
  });

  it('shows error notice when loading fails', async () => {
    mockGetTicketDetail.mockRejectedValue(new Error('Not found'));
    render(<TicketDetailScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('error-notice')).toBeTruthy();
    });
  });
});
