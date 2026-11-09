import '../../helpers/test-utils';
import { render, screen, waitFor } from '@testing-library/react-native';

import { makeSupportTicket, makeSupportTicketDetail } from '../../helpers/factories';
import { speakAppLanguage } from '../../helpers/real-i18n';

const mockListTickets = jest.fn();
const mockGetTicketDetail = jest.fn();
jest.mock('@/features/support/infrastructure/ticketApi', () => ({
  ticketApi: {
    listTickets: (...args: unknown[]) => mockListTickets(...args),
    createTicket: jest.fn(),
    getTicketDetail: (...args: unknown[]) => mockGetTicketDetail(...args),
    addTicketMessage: jest.fn(),
  },
}));

const mockExpoRouter = jest.requireMock<Record<string, unknown>>('expo-router');
mockExpoRouter.useLocalSearchParams = () => ({ ticketId: 'ticket-A' });

import TicketDetailScreen from '@/app/(stack)/ticket-detail';
import TicketsScreen from '@/app/(stack)/tickets';

const ticket = {
  id: 'ticket-A',
  subject: 'Impossible de scanner',
  status: 'open' as const,
  priority: 'high' as const,
  createdAt: '2026-03-15T10:00:00.000Z',
};

describe('Tickets — chaque libellé parle la langue de l’appli', () => {
  beforeEach(() => {
    speakAppLanguage('fr');
  });

  it('DEC-2026-11-09 · la liste montre « Haute », « 3 messages » et une date française', async () => {
    mockListTickets.mockResolvedValue({
      data: [makeSupportTicket({ ...ticket, messageCount: 3 })],
      total: 1,
      page: 1,
      limit: 15,
      totalPages: 1,
    });

    render(<TicketsScreen />);

    await waitFor(() => {
      expect(screen.getByText('Impossible de scanner')).toBeTruthy();
    });
    expect(screen.getByText('Haute')).toBeTruthy();
    expect(screen.getByText('3 messages')).toBeTruthy();
    expect(screen.getByText('15 mars 2026')).toBeTruthy();
  });

  it('DEC-2026-11-09 · le détail montre « Haute » et « Créé le 15 mars 2026 … »', async () => {
    mockGetTicketDetail.mockResolvedValue({
      ticket: makeSupportTicketDetail({ ...ticket, messages: [] }),
    });

    render(<TicketDetailScreen />);

    await waitFor(() => {
      expect(screen.getByText('Impossible de scanner')).toBeTruthy();
    });
    expect(screen.getByText('Haute')).toBeTruthy();
    expect(screen.getByText(/^Créé le 15 mars 2026/)).toBeTruthy();
  });
});
