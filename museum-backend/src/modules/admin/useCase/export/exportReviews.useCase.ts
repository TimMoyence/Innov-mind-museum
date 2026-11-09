import { AUDIT_ADMIN_EXPORT_REVIEWS } from '@shared/audit/audit.types';
import { forbidden } from '@shared/errors/app.error';

import type { ExportInput, ExportRowReview } from '@modules/admin/domain/export/csv-export.types';
import type { ExportReviewsRepository } from '@modules/admin/domain/export/export-repositories.port';
import type { LogActorActionInput } from '@shared/audit/audit.service';
import type { AuditLogEntry } from '@shared/audit/audit.types';

export type { ExportReviewsRepository };

export interface ExportAuditService {
  log(entry: AuditLogEntry): Promise<void>;
  logActorAction(input: LogActorActionInput): Promise<void>;
}

export class ExportReviewsUseCase {
  constructor(
    private readonly repository: ExportReviewsRepository,
    private readonly audit: ExportAuditService,
  ) {}

  async execute(input: ExportInput): Promise<AsyncIterable<ExportRowReview>> {
    if (input.actorRole !== 'super_admin') {
      throw forbidden('Reviews export is restricted to super_admin');
    }

    await this.audit.logActorAction({
      action: AUDIT_ADMIN_EXPORT_REVIEWS,
      actorId: input.actorId,
      metadata: {
        kind: 'reviews',
        scopeMuseumId: null,
      },
    });

    return this.repository.streamReviews();
  }
}
