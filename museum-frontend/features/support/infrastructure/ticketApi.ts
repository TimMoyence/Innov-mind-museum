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

/** Service for support ticket API operations: list, create, detail, and messaging. */
export const ticketApi = {
  /**
   * Lists the current user's support tickets with optional pagination and filters.
   * @param params - Optional page, limit, status, and priority filters.
   * @returns Paginated list of tickets.
   */
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

  /**
   * Creates a new support ticket.
   * @param body - Ticket subject, description, optional priority and category.
   * @returns The created ticket wrapped in a `ticket` field.
   */
  async createTicket(body: CreateTicketBody): Promise<{ ticket: TicketDTO }> {
    return openApiRequest({
      path: '/api/support/tickets',
      method: 'post',
      body: JSON.stringify(body),
    });
  },

  /**
   * Fetches a single ticket with its message thread.
   * @param ticketId - UUID of the ticket.
   * @returns The ticket detail with messages wrapped in a `ticket` field.
   */
  async getTicketDetail(ticketId: string): Promise<{ ticket: TicketDetailDTO }> {
    return openApiRequest({
      path: '/api/support/tickets/{id}',
      method: 'get',
      pathParams: { id: ticketId },
    });
  },

  /**
   * Adds a message to an existing ticket thread.
   * @param ticketId - UUID of the ticket.
   * @param text - Message text.
   * @returns The created message wrapped in a `message` field.
   */
  async addTicketMessage(ticketId: string, text: string): Promise<{ message: TicketMessageDTO }> {
    return openApiRequest({
      path: '/api/support/tickets/{id}/messages',
      method: 'post',
      pathParams: { id: ticketId },
      body: JSON.stringify({ text }),
    });
  },
};
