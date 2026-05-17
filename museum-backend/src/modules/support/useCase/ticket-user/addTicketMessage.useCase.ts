import { badRequest, notFound, forbidden } from '@shared/errors/app.error';

import type { ISupportRepository } from '@modules/support/domain/ticket/support.repository.interface';
import type { TicketMessageDTO } from '@modules/support/domain/ticket/support.types';

export interface AddTicketMessageInput {
  ticketId: string;
  senderId: number;
  senderRole: string;
  text: string;
}

/** Auto-transitions 'open' → 'in_progress' when an admin/moderator replies. */
export class AddTicketMessageUseCase {
  constructor(private readonly repository: ISupportRepository) {}

  async execute(input: AddTicketMessageInput): Promise<TicketMessageDTO> {
    const text = input.text.trim();
    if (!text || text.length < 1 || text.length > 5000) {
      throw badRequest('text must be between 1 and 5000 characters');
    }

    const isAdminOrMod = input.senderRole === 'admin' || input.senderRole === 'moderator';

    const ticket = await this.repository.getTicketById(input.ticketId);
    if (!ticket) {
      throw notFound('Ticket not found');
    }

    // SEC: ownership check — non-admins can only post on their own tickets.
    if (!isAdminOrMod && ticket.userId !== input.senderId) {
      throw forbidden('You do not have access to this ticket');
    }

    const message = await this.repository.addMessage({
      ticketId: input.ticketId,
      senderId: input.senderId,
      senderRole: input.senderRole,
      text,
    });

    if (isAdminOrMod && ticket.status === 'open') {
      await this.repository.updateTicket({
        ticketId: input.ticketId,
        status: 'in_progress',
      });
    }

    return message;
  }
}
