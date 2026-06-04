import { AUDIT_ADMIN_EXPORT_TICKETS } from '@shared/audit/audit.types';
import { forbidden } from '@shared/errors/app.error';

import type { ExportInput, ExportRowTicket } from '@modules/admin/domain/export/csv-export.types';
import type { ExportTicketsRepository } from '@modules/admin/domain/export/export-repositories.port';
import type { LogActorActionInput } from '@shared/audit/audit.service';
import type { AuditLogEntry } from '@shared/audit/audit.types';

// Re-exported (identity-preserving, spec R5) — `ExportTicketsRepository` moved
// to `domain/export/export-repositories.port.ts` (C1 close, run
// 2026-06-04-hexagonal-boundaries-enforcement).
export type { ExportTicketsRepository };

export interface ExportAuditService {
  log(entry: AuditLogEntry): Promise<void>;
  logActorAction(input: LogActorActionInput): Promise<void>;
}

/**
 * Admin CSV export — support tickets (R2 R3/R4/R19 + Q1 BLOCKER + Q7).
 *
 * super_admin only ; every other role → 403 BEFORE any repo call.
 * `user_email_pseudonym` pseudonymised for ALL roles incl. super_admin (R19/D6/Q7
 * — CSVs are screenshot-able, raw emails leak too easily vs in-app reads).
 *
 * Ordering: audit awaited BEFORE first row yields (N6/AC10). Metadata never
 * includes subject/description text (N9).
 */
export class ExportSupportTicketsUseCase {
  constructor(
    private readonly repository: ExportTicketsRepository,
    private readonly audit: ExportAuditService,
  ) {}

  async execute(input: ExportInput): Promise<AsyncIterable<ExportRowTicket>> {
    if (input.actorRole !== 'super_admin') {
      throw forbidden('Tickets export is restricted to super_admin');
    }

    await this.audit.logActorAction({
      action: AUDIT_ADMIN_EXPORT_TICKETS,
      actorId: input.actorId,
      metadata: {
        kind: 'tickets',
        scopeMuseumId: null,
      },
    });

    return this.repository.streamSupportTickets();
  }
}
