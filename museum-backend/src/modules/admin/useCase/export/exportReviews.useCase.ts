import { AUDIT_ADMIN_EXPORT_REVIEWS } from '@shared/audit/audit.types';
import { forbidden } from '@shared/errors/app.error';

import type { ExportInput, ExportRowReview } from '@modules/admin/domain/export/csv-export.types';
import type { AuditLogEntry } from '@shared/audit/audit.types';

/** Repository port — reviews are unscoped (Q1 BLOCKER : no `museum_id`). */
export interface ExportReviewsRepository {
  streamReviews(): AsyncIterable<ExportRowReview>;
}

/** Audit service port restricted to the `log` surface (mirror sessions UC). */
export interface ExportAuditService {
  log(entry: AuditLogEntry): Promise<void>;
}

/**
 * Admin CSV export — reviews (R2 R2 / R4 / R18 + Q1 BLOCKER).
 *
 * Per Q1 default (b) : `reviews` lacks a `museum_id` column today, so museum
 * scoping is impossible. Only `super_admin` may export ; every other role
 * (museum_manager, admin, moderator, visitor) → 403 BEFORE any repo call.
 *
 * `user_id_pseudonym` is ALWAYS pseudonymised in the row stream by the
 * repository (R18) — review authors are end-users and raw IDs would let an
 * admin pivot back to the visitor account.
 *
 * Audit row is `await`-ed BEFORE the first row is yielded (N6 / AC10) ;
 * metadata payload never includes free-text PII (N9).
 */
export class ExportReviewsUseCase {
  constructor(
    private readonly repository: ExportReviewsRepository,
    private readonly audit: ExportAuditService,
  ) {}

  /**
   * Executes the reviews export pipeline (super_admin only).
   *
   * @param input - Authenticated actor context.
   * @returns AsyncIterable yielding {@link ExportRowReview} rows.
   */
  async execute(input: ExportInput): Promise<AsyncIterable<ExportRowReview>> {
    if (input.actorRole !== 'super_admin') {
      // Q1 BLOCKER + Q3 + R4 — collapse the three denial paths into one
      // 403 ; the route layer already differentiates moderator / visitor /
      // museum_manager via response copy if needed.
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
