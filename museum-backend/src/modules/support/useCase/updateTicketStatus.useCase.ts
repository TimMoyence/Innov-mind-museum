import { auditService, AUDIT_ADMIN_TICKET_UPDATED } from '@shared/audit';
import { badRequest, notFound } from '@shared/errors/app.error';

import { TICKET_STATUSES, TICKET_PRIORITIES } from '../domain/support.types';

import type { ISupportRepository } from '../domain/support.repository.interface';
import type { TicketDTO, TicketStatus, TicketPriority } from '../domain/support.types';

/** Input for the update-ticket-status use case. */
export interface UpdateTicketStatusInput {
  ticketId: string;
  status?: string;
  priority?: string;
  assignedTo?: number | null;
  actorId: number;
  ip?: string;
  requestId?: string;
}

/** Validates enum values, delegates update to the repository, and logs an audit event. */
export class UpdateTicketStatusUseCase {
  constructor(private readonly repository: ISupportRepository) {}

  /** Validates enum values, delegates the update, and emits an audit event. */
  async execute(input: UpdateTicketStatusInput): Promise<TicketDTO> {
    if (input.status && !TICKET_STATUSES.includes(input.status as TicketStatus)) {
      throw badRequest(`status must be one of: ${TICKET_STATUSES.join(', ')}`);
    }
    if (input.priority && !TICKET_PRIORITIES.includes(input.priority as TicketPriority)) {
      throw badRequest(`priority must be one of: ${TICKET_PRIORITIES.join(', ')}`);
    }

    if (!input.status && !input.priority && input.assignedTo === undefined) {
      throw badRequest('At least one of status, priority, or assignedTo must be provided');
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

    await auditService.log({
      action: AUDIT_ADMIN_TICKET_UPDATED,
      actorType: 'user',
      actorId: input.actorId,
      targetType: 'support_ticket',
      targetId: input.ticketId,
      metadata: {
        ...(input.status && { status: input.status }),
        ...(input.priority && { priority: input.priority }),
        ...(input.assignedTo !== undefined && { assignedTo: input.assignedTo }),
      },
      ip: input.ip ?? null,
      requestId: input.requestId ?? null,
    });

    return updated;
  }
}
