import { ticketApi } from '@/features/support/infrastructure/ticketApi';

jest.mock('@/shared/api/openapiClient', () => ({
  openApiRequest: jest.fn(),
}));

import { openApiRequest } from '@/shared/api/openapiClient';
const mockOpenApiRequest = openApiRequest as jest.Mock;

describe('ticketApi', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('listTickets', () => {
    it('calls GET /api/support/tickets with query params', async () => {
      mockOpenApiRequest.mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      });

      await ticketApi.listTickets({ page: 2, limit: 5, status: 'open' });

      expect(mockOpenApiRequest).toHaveBeenCalledWith({
        path: '/api/support/tickets',
        method: 'get',
        query: { page: 2, limit: 5, status: 'open', priority: undefined },
      });
    });

    it('uses default empty params when none provided', async () => {
      mockOpenApiRequest.mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      });

      await ticketApi.listTickets();

      expect(mockOpenApiRequest).toHaveBeenCalledWith({
        path: '/api/support/tickets',
        method: 'get',
        query: { page: undefined, limit: undefined, status: undefined, priority: undefined },
      });
    });
  });

  describe('createTicket', () => {
    it('sends POST /api/support/tickets with body', async () => {
      const ticket = { id: 'uuid-1', subject: 'Help', status: 'open' };
      mockOpenApiRequest.mockResolvedValue({ ticket });

      const result = await ticketApi.createTicket({
        subject: 'Help',
        description: 'I need help',
        priority: 'high',
      });

      expect(mockOpenApiRequest).toHaveBeenCalledWith({
        path: '/api/support/tickets',
        method: 'post',
        body: JSON.stringify({ subject: 'Help', description: 'I need help', priority: 'high' }),
      });
      expect(result.ticket).toEqual(ticket);
    });
  });

  describe('getTicketDetail', () => {
    it('calls GET /api/support/tickets/{id} with path param', async () => {
      const ticket = { id: 'uuid-1', subject: 'Help', messages: [] };
      mockOpenApiRequest.mockResolvedValue({ ticket });

      const result = await ticketApi.getTicketDetail('uuid-1');

      expect(mockOpenApiRequest).toHaveBeenCalledWith({
        path: '/api/support/tickets/{id}',
        method: 'get',
        pathParams: { id: 'uuid-1' },
      });
      expect(result.ticket).toEqual(ticket);
    });
  });

  describe('addTicketMessage', () => {
    it('sends POST /api/support/tickets/{id}/messages with text', async () => {
      const message = { id: 'msg-1', text: 'Thanks', role: 'user' };
      mockOpenApiRequest.mockResolvedValue({ message });

      const result = await ticketApi.addTicketMessage('uuid-1', 'Thanks');

      expect(mockOpenApiRequest).toHaveBeenCalledWith({
        path: '/api/support/tickets/{id}/messages',
        method: 'post',
        pathParams: { id: 'uuid-1' },
        body: JSON.stringify({ text: 'Thanks' }),
      });
      expect(result.message).toEqual(message);
    });
  });
});
