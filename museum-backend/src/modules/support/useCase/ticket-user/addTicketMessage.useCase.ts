import { TEXT_LIMITS } from '@musaium/shared';

import { asTicketMessageView, ticketAccess } from '@modules/support/domain/ticket/ticket-access';
import { forbidden, notFound } from '@shared/errors/app.error';
import { assertWithinLimit } from '@shared/validation/text-field';

import type { ISupportRepository } from '@modules/support/domain/ticket/support.repository.interface';
import type {
  AddTicketMessageInput,
  TicketMessageView,
} from '@modules/support/domain/ticket/support.types';

export class AddTicketMessageUseCase {
  constructor(private readonly repository: ISupportRepository) {}

  async execute(
    input: AddTicketMessageInput & { senderMuseumId?: number | null },
  ): Promise<TicketMessageView> {
    const text = input.text.trim();
    assertWithinLimit('text', text, TEXT_LIMITS.ticketMessage);

    const ticket = await this.repository.getTicketById(input.ticketId);
    if (!ticket) {
      throw notFound('Ticket not found');
    }

    const access = ticketAccess(
      { id: input.senderId, role: input.senderRole, museumId: input.senderMuseumId },
      ticket,
    );
    if (!access) {
      throw forbidden('You do not have access to this ticket');
    }

    const message = await this.repository.addMessage({
      ticketId: input.ticketId,
      senderId: input.senderId,
      senderRole: input.senderRole,
      text,
    });

    if (access === 'staff' && ticket.status === 'open') {
      await this.repository.updateTicket({
        ticketId: input.ticketId,
        status: 'in_progress',
      });
    }

    return asTicketMessageView(ticket, message);
  }
}
