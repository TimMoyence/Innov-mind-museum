import { AUDIT_ADMIN_EXPORT_REVIEWS } from '@shared/audit/audit.types';
import { forbidden } from '@shared/errors/app.error';

import type { ExportInput, ExportRowReview } from '@modules/admin/domain/export/csv-export.types';
import type { AuditLogEntry } from '@shared/audit/audit.types';

/** Reviews are unscoped (Q1 BLOCKER: no `museum_id` column). */
export interface ExportReviewsRepository {
  streamReviews(): AsyncIterable<ExportRowReview>;
}

export interface ExportAuditService {
  log(entry: AuditLogEntry): Promise<void>;
}

/**
 * Admin CSV export — reviews (R2 R2/R4/R18 + Q1 BLOCKER).
 *
 * super_admin only ; manager/admin/moderator/visitor → 403 BEFORE any repo call
 * (no museum_id column = no scoping possible).
 *
 * `user_id_pseudonym` ALWAYS pseudonymised by repo (R18) — review authors are
 * end-users; raw IDs would let admin pivot back to the visitor account.
 *
 * Ordering: audit awaited BEFORE first row yields (N6/AC10). Metadata never
 * includes free-text PII (N9).
 */
export class ExportReviewsUseCase {
  constructor(
    private readonly repository: ExportReviewsRepository,
    private readonly audit: ExportAuditService,
  ) {}

  async execute(input: ExportInput): Promise<AsyncIterable<ExportRowReview>> {
    if (input.actorRole !== 'super_admin') {
      // Q1 BLOCKER + Q3 + R4 — single 403, route layer differentiates copy.
      throw forbidden('Reviews export is restricted to super_admin');
    }

    await this.audit.log({
      action: AUDIT_ADMIN_EXPORT_REVIEWS,
      actorType: 'user',
      actorId: input.actorId,
      metadata: {
        kind: 'reviews',
        scopeMuseumId: null,
      },
    });

    return this.repository.streamReviews();
  }
}
