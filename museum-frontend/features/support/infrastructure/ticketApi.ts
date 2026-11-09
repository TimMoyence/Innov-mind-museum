import { openApiRequest } from '@/shared/api/openapiClient';
import type { components } from '@/shared/api/generated/openapi';

type TicketDTO = components['schemas']['TicketDTO'];
type TicketDetailDTO = components['schemas']['TicketDetailDTO'];
type TicketMessageDTO = components['schemas']['TicketMessageDTO'];

interface ListTicketsParams {
  page?: number;
  limit?: number;
  status?: TicketDTO['status'];
  priority?: TicketDTO['priority'];
}

interface ListTicketsResponse {
  data: TicketDTO[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface CreateTicketBody {
  subject: string;
  description: string;
  priority?: TicketDTO['priority'];
  category?: string;
}

export const ticketApi = {
  async listTickets(params: ListTicketsParams = {}): Promise<ListTicketsResponse> {
    return openApiRequest({
      path: '/api/support/tickets',
      method: 'get',
      query: {
        page: params.page,
        limit: params.limit,
        status: params.status,
        priority: params.priority,
      },
    });
  },

  async createTicket(body: CreateTicketBody): Promise<{ ticket: TicketDTO }> {
    return openApiRequest({
      path: '/api/support/tickets',
      method: 'post',
      json: body,
    });
  },

  async getTicketDetail(ticketId: string): Promise<{ ticket: TicketDetailDTO }> {
    return openApiRequest({
      path: '/api/support/tickets/{id}',
      method: 'get',
      pathParams: { id: ticketId },
    });
  },

  async addTicketMessage(ticketId: string, text: string): Promise<{ message: TicketMessageDTO }> {
    return openApiRequest({
      path: '/api/support/tickets/{id}/messages',
      method: 'post',
      pathParams: { id: ticketId },
      json: { text },
    });
  },
};
