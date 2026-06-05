import { TICKET_STATUSES, TICKET_PRIORITIES } from '@modules/support/domain/ticket/support.types';
import { auditService, AUDIT_ADMIN_TICKET_UPDATED } from '@shared/audit';
import { badRequest, notFound } from '@shared/errors/app.error';

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
  /**
   * C1B — tenant ownership guard (BOLA, write side). `undefined`/`null` =
   * unscoped (super_admin/admin may update any ticket). When set (forced by the
   * route for a `museum_manager`), a ticket whose `museumId` differs from this
   * scope is treated as non-existent → `404` (existence-hiding), no write.
   */
  scopeMuseumId?: number | null;
}

export class UpdateTicketStatusUseCase {
  constructor(private readonly repository: ISupportRepository) {}

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

    // C1B — read-before-write so the tenant ownership guard (BOLA write side)
    // runs BEFORE any mutation. A scoped actor (museum_manager) may only update
    // tickets of their own museum; a missing, foreign-tenant or NULL-museum
    // ticket is hidden as non-existent (404), so no audit row is emitted for a
    // rejected attempt. This also tightens a latent bug (the old blind update
    // 404'd only AFTER attempting the write).
    const existing = await this.repository.getTicketById(input.ticketId);
    if (!existing) {
      throw notFound('Ticket not found');
    }
    if (input.scopeMuseumId != null && existing.museumId !== input.scopeMuseumId) {
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
