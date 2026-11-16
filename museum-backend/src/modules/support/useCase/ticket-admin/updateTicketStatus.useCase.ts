import { TICKET_STATUSES, TICKET_PRIORITIES } from '@modules/support/domain/ticket/support.types';
import { auditService, AUDIT_ADMIN_TICKET_UPDATED } from '@shared/audit';
import { isOutsideMuseumScope } from '@shared/authz/tenant-scope';
import { invalidInput, notFound } from '@shared/errors/app.error';
import { assertOneOf } from '@shared/validation/one-of';

import type { ISupportRepository } from '@modules/support/domain/ticket/support.repository.interface';
import type {
  TicketDTO,
  TicketStatus,
  TicketPriority,
} from '@modules/support/domain/ticket/support.types';

export interface UpdateTicketStatusInput {
  ticketId: string;
  status?: string;
  priority?: string;
  assignedTo?: number | null;
  actorId: number;
  ip?: string;
  requestId?: string;
  scopeMuseumId?: number | null;
}

export class UpdateTicketStatusUseCase {
  constructor(private readonly repository: ISupportRepository) {}

  async execute(input: UpdateTicketStatusInput): Promise<TicketDTO> {
    if (input.status) assertOneOf('status', TICKET_STATUSES, input.status);
    if (input.priority) assertOneOf('priority', TICKET_PRIORITIES, input.priority);

    if (!input.status && !input.priority && input.assignedTo === undefined) {
      throw invalidInput('At least one of status, priority, or assignedTo must be provided');
    }

    const existing = await this.repository.getTicketById(input.ticketId);
    if (!existing) {
      throw notFound('Ticket not found');
    }
    if (isOutsideMuseumScope(input.scopeMuseumId, existing.museumId)) {
      throw notFound('Ticket not found');
    }

    const updated = await this.repository.updateTicket({
      ticketId: input.ticketId,
      status: input.status as TicketStatus | undefined,
      priority: input.priority as TicketPriority | undefined,
      assignedTo: input.assignedTo,
    });

    if (!updated) {
      throw notFound('Ticket not found');
    }

    await auditService.logActorAction({
      action: AUDIT_ADMIN_TICKET_UPDATED,
      actorId: input.actorId,
      targetType: 'support_ticket',
      targetId: input.ticketId,
      metadata: {
        ...(input.status && { status: input.status }),
        ...(input.priority && { priority: input.priority }),
        ...(input.assignedTo !== undefined && { assignedTo: input.assignedTo }),
      },
      ip: input.ip,
      requestId: input.requestId,
    });

    return updated;
  }
}
