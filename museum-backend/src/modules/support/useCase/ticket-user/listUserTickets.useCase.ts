import { TICKET_STATUSES, TICKET_PRIORITIES } from '@modules/support/domain/ticket/support.types';
import { badRequest } from '@shared/errors/app.error';
import { assertPagination } from '@shared/types/pagination';

import type { ISupportRepository } from '@modules/support/domain/ticket/support.repository.interface';
import type {
  TicketDTO,
  ListTicketsFilters,
  TicketStatus,
  TicketPriority,
} from '@modules/support/domain/ticket/support.types';
import type { PaginatedResult } from '@shared/types/pagination';

interface ListUserTicketsInput {
  userId: number;
  status?: string;
  priority?: string;
  page: number;
  limit: number;
}

export class ListUserTicketsUseCase {
  constructor(private readonly repository: ISupportRepository) {}

  async execute(input: ListUserTicketsInput): Promise<PaginatedResult<TicketDTO>> {
    const { page, limit } = assertPagination({ page: input.page, limit: input.limit });

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
      pagination: { page, limit },
    };

    return await this.repository.listTickets(filters);
  }
}
