import { TEXT_LIMITS } from '@musaium/shared';

import { TICKET_PRIORITIES } from '@modules/support/domain/ticket/support.types';
import { auditService, AUDIT_SUPPORT_TICKET_CREATED } from '@shared/audit';
import { nonEmpty } from '@shared/utils/defaults';
import { assertOneOf } from '@shared/validation/one-of';
import { assertWithinLimit } from '@shared/validation/text-field';

import type { ISupportRepository } from '@modules/support/domain/ticket/support.repository.interface';
import type { CreateTicketInput, TicketDTO } from '@modules/support/domain/ticket/support.types';

interface CreateTicketUseCaseInput {
  userId: number;
  subject: string;
  description: string;
  priority?: string;
  category?: string;
  museumId?: number | null;
  ip?: string;
  requestId?: string;
}

export class CreateTicketUseCase {
  constructor(private readonly repository: ISupportRepository) {}

  async execute(input: CreateTicketUseCaseInput): Promise<TicketDTO> {
    const subject = input.subject.trim();
    assertWithinLimit('subject', subject, TEXT_LIMITS.ticketSubject);

    const description = input.description.trim();
    assertWithinLimit('description', description, TEXT_LIMITS.ticketDescription);

    const category = input.category?.trim() ?? '';
    assertWithinLimit('category', category, TEXT_LIMITS.ticketCategory);

    if (input.priority) assertOneOf('priority', TICKET_PRIORITIES, input.priority);

    const createInput: CreateTicketInput = {
      userId: input.userId,
      subject,
      description,
      priority: (input.priority as CreateTicketInput['priority']) ?? undefined,
      category: nonEmpty(category),
      museumId: input.museumId ?? null,
    };

    const ticket = await this.repository.createTicket(createInput);

    await auditService.logActorAction({
      action: AUDIT_SUPPORT_TICKET_CREATED,
      actorId: input.userId,
      targetType: 'support_ticket',
      targetId: ticket.id,
      metadata: { subject: ticket.subject, priority: ticket.priority },
      ip: input.ip,
      requestId: input.requestId,
    });

    return ticket;
  }
}
