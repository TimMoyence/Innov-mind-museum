import { AUDIT_ADMIN_EXPORT_TICKETS } from '@shared/audit/audit.types';
import { forbidden } from '@shared/errors/app.error';

import type { ExportInput, ExportRowTicket } from '@modules/admin/domain/export/csv-export.types';
import type { AuditLogEntry } from '@shared/audit/audit.types';

/** Repository port — tickets are unscoped (Q1 BLOCKER : no `museum_id`). */
export interface ExportTicketsRepository {
  streamSupportTickets(): AsyncIterable<ExportRowTicket>;
}

/** Audit service port restricted to the `log` surface. */
export interface ExportAuditService {
  log(entry: AuditLogEntry): Promise<void>;
}

/**
 * Admin CSV export — support tickets (R2 R3 / R4 / R19 + Q1 BLOCKER + Q7).
 *
 * Same RBAC posture as reviews : per Q1 default (b), the `support_tickets`
 * table lacks a `museum_id` column, so only `super_admin` may export. Every
 * other role → 403 BEFORE any repo call.
 *
 * `user_email_pseudonym` is pseudonymised in the row stream for ALL roles
 * including super_admin (R19 / D6 / Q7) — a CSV is portable and
 * screenshot-able, so raw emails leak too easily compared to in-app reads.
 *
 * Audit row is `await`-ed BEFORE the first row is yielded (N6 / AC10) ; the
 * metadata payload is row-content-free (N9 — never includes subject /
 * description text).
 */
export class ExportSupportTicketsUseCase {
  constructor(
    private readonly repository: ExportTicketsRepository,
    private readonly audit: ExportAuditService,
  ) {}

  /**
   * Executes the tickets export pipeline (super_admin only).
   *
   * @param input - Authenticated actor context.
   * @returns AsyncIterable yielding {@link ExportRowTicket} rows.
   */
  async execute(input: ExportInput): Promise<AsyncIterable<ExportRowTicket>> {
    if (input.actorRole !== 'super_admin') {
      throw forbidden('Tickets export is restricted to super_admin');
    }

    await this.audit.log({
      action: AUDIT_ADMIN_EXPORT_TICKETS,
      actorType: 'user',
      actorId: input.actorId,
      metadata: {
        kind: 'tickets',
        scopeMuseumId: null,
      },
    });

    return this.repository.streamSupportTickets();
  }
}
