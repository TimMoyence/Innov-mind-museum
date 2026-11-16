import { asTicketMessageView, ticketAccess } from '@modules/support/domain/ticket/ticket-access';
import { notFound, forbidden } from '@shared/errors/app.error';

import type { ISupportRepository } from '@modules/support/domain/ticket/support.repository.interface';
import type { TicketDetailView } from '@modules/support/domain/ticket/support.types';

interface GetTicketDetailInput {
  ticketId: string;
  userId: number;
  userRole: string;
  userMuseumId?: number | null;
}

export class GetTicketDetailUseCase {
  constructor(private readonly repository: ISupportRepository) {}

  async execute(input: GetTicketDetailInput): Promise<TicketDetailView> {
    const ticket = await this.repository.getTicketById(input.ticketId);
    if (!ticket) {
      throw notFound('Ticket not found');
    }

    const viewer = { id: input.userId, role: input.userRole, museumId: input.userMuseumId };
    if (!ticketAccess(viewer, ticket)) {
      throw forbidden('You do not have access to this ticket');
    }

    return {
      ...ticket,
      messages: ticket.messages.map((message) => asTicketMessageView(ticket, message)),
    };
  }
}
