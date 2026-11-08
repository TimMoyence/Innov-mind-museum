import { describeLimit, isWithinLimit, TEXT_LIMITS } from '@musaium/shared';

import { auditService, AUDIT_SUPPORT_TICKET_CREATED } from '@shared/audit';
import { invalidInput } from '@shared/errors/app.error';

import type { ISupportRepository } from '@modules/support/domain/ticket/support.repository.interface';
import type { CreateTicketInput, TicketDTO } from '@modules/support/domain/ticket/support.types';

interface CreateTicketUseCaseInput {
  userId: number;
  subject: string;
  description: string;
  priority?: string;
  category?: string;
  /**
   * B2B multi-tenant scope (Wave B C7 / R-C7c — TD-COR-WAVEB-02). Threaded
   * from the authenticated user's JWT `museumId` claim in the route handler
   * (`support.route.ts`). `null`/undefined for callers without a tenant
   * attachment (pre-multi-tenant catalog-level tickets).
   */
  museumId?: number | null;
  ip?: string;
  requestId?: string;
}

export class CreateTicketUseCase {
  constructor(private readonly repository: ISupportRepository) {}

  async execute(input: CreateTicketUseCaseInput): Promise<TicketDTO> {
    const subject = input.subject.trim();
    if (!isWithinLimit(subject, TEXT_LIMITS.ticketSubject)) {
      throw invalidInput(describeLimit('subject', TEXT_LIMITS.ticketSubject));
    }

    const description = input.description.trim();
    if (!isWithinLimit(description, TEXT_LIMITS.ticketDescription)) {
      throw invalidInput(describeLimit('description', TEXT_LIMITS.ticketDescription));
    }

    const category = input.category?.trim() ?? '';
    if (!isWithinLimit(category, TEXT_LIMITS.ticketCategory)) {
      throw invalidInput(describeLimit('category', TEXT_LIMITS.ticketCategory));
    }

    const validPriorities: string[] = ['low', 'medium', 'high'];
    if (input.priority && !validPriorities.includes(input.priority)) {
      throw invalidInput(`priority must be one of: ${validPriorities.join(', ')}`);
    }

    const createInput: CreateTicketInput = {
      userId: input.userId,
      subject,
      description,
      priority: (input.priority as CreateTicketInput['priority']) ?? undefined,
      category: category === '' ? undefined : category,
      // Wave B C7 / R-C7c — TD-COR-WAVEB-02. Thread tenant scope down to the
      // repository so `support_tickets.museum_id` is populated from the JWT
      // claim. `undefined` collapses to `null` in `SupportRepositoryPg.createTicket`
      // (support.repository.pg.ts:64).
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
