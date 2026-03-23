import { notFound, forbidden } from '@shared/errors/app.error';
import type { ISupportRepository } from '../domain/support.repository.interface';
import type { TicketDetailDTO } from '../domain/support.types';

export interface GetTicketDetailInput {
  ticketId: string;
  userId: number;
  userRole: string;
}

/** Fetches a ticket with messages, checking ownership or admin/moderator role. */
export class GetTicketDetailUseCase {
  constructor(private readonly repository: ISupportRepository) {}

  async execute(input: GetTicketDetailInput): Promise<TicketDetailDTO> {
    const ticket = await this.repository.getTicketById(input.ticketId);
    if (!ticket) {
      throw notFound('Ticket not found');
    }

    const isAdminOrMod = input.userRole === 'admin' || input.userRole === 'moderator';
    if (!isAdminOrMod && ticket.userId !== input.userId) {
      throw forbidden('You do not have access to this ticket');
    }

    return ticket;
  }
}
