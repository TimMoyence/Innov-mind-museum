import { badRequest } from '@shared/errors/app.error';

import { TICKET_STATUSES, TICKET_PRIORITIES } from '../domain/support.types';

import type { ISupportRepository } from '../domain/support.repository.interface';
import type {
  TicketDTO,
  ListTicketsFilters,
  TicketStatus,
  TicketPriority,
} from '../domain/support.types';
import type { PaginatedResult } from '@shared/types/pagination';

/** Input for listing a specific user's support tickets. */
interface ListUserTicketsInput {
  userId: number;
  status?: string;
  priority?: string;
  page: number;
  limit: number;
}

/** Validates pagination and lists tickets for a specific user. */
export class ListUserTicketsUseCase {
  constructor(private readonly repository: ISupportRepository) {}

  /** Validates pagination and filter enums, then retrieves a paginated list of the user's tickets. */
  async execute(input: ListUserTicketsInput): Promise<PaginatedResult<TicketDTO>> {
    if (!Number.isInteger(input.page) || input.page < 1) {
      throw badRequest('page must be a positive integer');
    }
    if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100) {
      throw badRequest('limit must be between 1 and 100');
    }

    if (input.status && !TICKET_STATUSES.includes(input.status as TicketStatus)) {
      throw badRequest(`status must be one of: ${TICKET_STATUSES.join(', ')}`);
    }
    if (input.priority && !TICKET_PRIORITIES.includes(input.priority as TicketPriority)) {
      throw badRequest(`priority must be one of: ${TICKET_PRIORITIES.join(', ')}`);
    }

    const filters: ListTicketsFilters = {
      userId: input.userId,
      status: input.status as TicketStatus | undefined,
      priority: input.priority as TicketPriority | undefined,
      pagination: { page: input.page, limit: input.limit },
    };

    return await this.repository.listTickets(filters);
  }
}
