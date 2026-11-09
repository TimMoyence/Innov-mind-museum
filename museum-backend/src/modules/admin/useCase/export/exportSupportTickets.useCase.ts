import { AUDIT_ADMIN_EXPORT_TICKETS } from '@shared/audit/audit.types';
import { forbidden } from '@shared/errors/app.error';

import type { ExportInput, ExportRowTicket } from '@modules/admin/domain/export/csv-export.types';
import type { ExportTicketsRepository } from '@modules/admin/domain/export/export-repositories.port';
import type { LogActorActionInput } from '@shared/audit/audit.service';
import type { AuditLogEntry } from '@shared/audit/audit.types';

export type { ExportTicketsRepository };

export interface ExportAuditService {
  log(entry: AuditLogEntry): Promise<void>;
  logActorAction(input: LogActorActionInput): Promise<void>;
}

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
