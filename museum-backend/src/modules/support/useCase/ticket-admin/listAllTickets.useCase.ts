import { TICKET_STATUSES, TICKET_PRIORITIES } from '@modules/support/domain/ticket/support.types';
import { assertPagination } from '@shared/types/pagination';
import { assertOneOf } from '@shared/validation/one-of';

import type { ISupportRepository } from '@modules/support/domain/ticket/support.repository.interface';
import type {
  TicketDTO,
  ListTicketsFilters,
  TicketStatus,
  TicketPriority,
} from '@modules/support/domain/ticket/support.types';
import type { PaginatedResult } from '@shared/types/pagination';

export interface ListAllTicketsInput {
  status?: string;
  priority?: string;
  page: number;
  limit: number;
  museumId?: number | null;
}

export class ListAllTicketsUseCase {
  constructor(private readonly repository: ISupportRepository) {}

  async execute(input: ListAllTicketsInput): Promise<PaginatedResult<TicketDTO>> {
    const { page, limit } = assertPagination({ page: input.page, limit: input.limit });

    if (input.status) assertOneOf('status', TICKET_STATUSES, input.status);
    if (input.priority) assertOneOf('priority', TICKET_PRIORITIES, input.priority);

    const filters: ListTicketsFilters = {
      status: input.status as TicketStatus | undefined,
      priority: input.priority as TicketPriority | undefined,
      museumId: input.museumId,
      pagination: { page, limit },
    };

    return await this.repository.listTickets(filters);
  }
}
