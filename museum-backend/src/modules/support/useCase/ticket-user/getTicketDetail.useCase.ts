import { notFound, forbidden } from '@shared/errors/app.error';

import type { ISupportRepository } from '@modules/support/domain/ticket/support.repository.interface';
import type { TicketDetailDTO } from '@modules/support/domain/ticket/support.types';

interface GetTicketDetailInput {
  ticketId: string;
  userId: number;
  userRole: string;
}

export class GetTicketDetailUseCase {
  constructor(private readonly repository: ISupportRepository) {}

  async execute(input: GetTicketDetailInput): Promise<TicketDetailDTO> {
    const ticket = await this.repository.getTicketById(input.ticketId);
    if (!ticket) {
      throw notFound('Ticket not found');
    }

    // SEC: ownership check — non-admins can only read their own tickets.
    const isAdminOrMod = input.userRole === 'admin' || input.userRole === 'moderator';
    if (!isAdminOrMod && ticket.userId !== input.userId) {
      throw forbidden('You do not have access to this ticket');
    }

    return ticket;
  }
}
