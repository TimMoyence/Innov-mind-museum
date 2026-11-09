import '../../helpers/test-utils';
import { render, screen, waitFor } from '@testing-library/react-native';

import { makeSupportTicket } from '../../helpers/factories';
import { speakAppLanguage } from '../../helpers/real-i18n';

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

describe('Tickets — le nombre de messages dans les langues sans pluriel _one/_other', () => {
  it.each([
    ['ja', '3件のメッセージ'],
    ['zh', '3 条消息'],
    ['ar', 'عدد الرسائل: 3'],
    ['fr', '1 message'],
  ] as const)('BREAKER-2026-11-09 · en %s, la ligne se lit « %s »', async (language, expected) => {
    speakAppLanguage(language);
    mockListTickets.mockResolvedValue({
      data: [
        makeSupportTicket({
          subject: 'Ticket',
          messageCount: language === 'fr' ? 1 : 3,
        }),
      ],
      total: 1,
      page: 1,
      limit: 15,
      totalPages: 1,
    });

    render(<TicketsScreen />);

    await waitFor(() => {
      expect(screen.getByText('Ticket')).toBeTruthy();
    });
    expect(screen.getByText(expected)).toBeTruthy();
  });
});
