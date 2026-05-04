import { auditService, AUDIT_SUPPORT_TICKET_CREATED } from '@shared/audit';
import { badRequest } from '@shared/errors/app.error';

import type { ISupportRepository } from '@modules/support/domain/ticket/support.repository.interface';
import type { CreateTicketInput, TicketDTO } from '@modules/support/domain/ticket/support.types';

/** Input for the create-ticket use case. */
interface CreateTicketUseCaseInput {
  userId: number;
  subject: string;
  description: string;
  priority?: string;
  category?: string;
  ip?: string;
  requestId?: string;
}

/** Validates inputs and creates a new support ticket. */
export class CreateTicketUseCase {
  constructor(private readonly repository: ISupportRepository) {}

  /** Validates inputs, creates the ticket, and emits an audit event. */
  async execute(input: CreateTicketUseCaseInput): Promise<TicketDTO> {
    const subject = input.subject.trim();
    if (!subject || subject.length < 1 || subject.length > 256) {
      throw badRequest('subject must be between 1 and 256 characters');
    }

    const description = input.description.trim();
    if (!description || description.length < 1 || description.length > 5000) {
      throw badRequest('description must be between 1 and 5000 characters');
    }

    const validPriorities: string[] = ['low', 'medium', 'high'];
    if (input.priority && !validPriorities.includes(input.priority)) {
      throw badRequest(`priority must be one of: ${validPriorities.join(', ')}`);
    }

    const createInput: CreateTicketInput = {
      userId: input.userId,
      subject,
      description,
      priority: (input.priority as CreateTicketInput['priority']) ?? undefined,
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string fallback
      category: input.category?.trim().slice(0, 64) || undefined,
    };

    const ticket = await this.repository.createTicket(createInput);

    await auditService.log({
      action: AUDIT_SUPPORT_TICKET_CREATED,
      actorType: 'user',
      actorId: input.userId,
      targetType: 'support_ticket',
      targetId: ticket.id,
      metadata: { subject: ticket.subject, priority: ticket.priority },
      ip: input.ip ?? null,
      requestId: input.requestId ?? null,
    });

    return ticket;
  }
}
