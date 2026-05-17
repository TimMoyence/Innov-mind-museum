import { auditService as defaultAuditService, AUDIT_ADMIN_REVIEW_MODERATED } from '@shared/audit';
import { DEFAULT_EMAIL_LOCALE } from '@shared/email/email-locale';
import { badRequest, notFound } from '@shared/errors/app.error';
import { logger } from '@shared/logger/logger';
import { fireAndForget } from '@shared/utils/fire-and-forget';

import type { ReviewModerationNotifier } from '@modules/review/domain/ports/review-moderation-notifier.port';
import type { IReviewRepository } from '@modules/review/domain/review/review.repository.interface';
import type { ReviewDTO, ReviewStatus } from '@modules/review/domain/review/review.types';
import type { AuditService } from '@shared/audit';

export interface ReviewAuthorSnapshot {
  id: number;
  email: string;
  firstname?: string;
  notifyOnReviewModeration: boolean;
}

export type ReviewAuthorLookup = (userId: number) => Promise<ReviewAuthorSnapshot | null>;

export interface ModerateReviewUseCaseInput {
  reviewId: string;
  status: string;
  actorId: number;
  ip?: string;
  requestId?: string;
}

const MODERATION_STATUSES: ReviewStatus[] = ['approved', 'rejected'];

export interface ModerateReviewUseCaseDeps {
  audit?: Pick<AuditService, 'log'>;
  notifier?: ReviewModerationNotifier;
  authorLookup?: ReviewAuthorLookup;
}

/**
 * Compliance: SOC2 CC7.2 + GDPR Art. 30 + NIST SP 800-53 AU-2 — every privileged
 * action on user-generated content is auditable. Notification delivery is
 * best-effort: a failed email must NOT fail the moderation (ADR-notifications-best-effort).
 */
export class ModerateReviewUseCase {
  private readonly audit: Pick<AuditService, 'log'>;
  private readonly notifier?: ReviewModerationNotifier;
  private readonly authorLookup?: ReviewAuthorLookup;

  constructor(
    private readonly repository: IReviewRepository,
    depsOrAudit: ModerateReviewUseCaseDeps | Pick<AuditService, 'log'> = {},
  ) {
    // Back-compat: accept either a full deps object OR a bare audit stub (existing tests).
    const deps: ModerateReviewUseCaseDeps =
      'log' in depsOrAudit ? { audit: depsOrAudit } : depsOrAudit;
    this.audit = deps.audit ?? defaultAuditService;
    this.notifier = deps.notifier;
    this.authorLookup = deps.authorLookup;
  }

  async execute(input: ModerateReviewUseCaseInput): Promise<ReviewDTO> {
    if (!MODERATION_STATUSES.includes(input.status as ReviewStatus)) {
      throw badRequest(`status must be one of: ${MODERATION_STATUSES.join(', ')}`);
    }

    const before = await this.repository.getReviewById(input.reviewId);
    if (!before) {
      throw notFound('Review not found');
    }

    const updated = await this.repository.moderateReview({
      reviewId: input.reviewId,
      status: input.status as ReviewStatus,
    });

    if (!updated) {
      throw notFound('Review not found');
    }

    await this.audit.log({
      action: AUDIT_ADMIN_REVIEW_MODERATED,
      actorType: 'user',
      actorId: input.actorId,
      targetType: 'review',
      targetId: input.reviewId,
      metadata: {
        beforeStatus: before.status,
        afterStatus: updated.status,
      },
      ip: input.ip ?? null,
      requestId: input.requestId ?? null,
    });

    this.scheduleAuthorNotification(updated);

    return updated;
  }

  /** Fire-and-forget: best-effort email to author, gated on their opt-in flag. */
  private scheduleAuthorNotification(updated: ReviewDTO): void {
    if (!this.notifier || !this.authorLookup) return;
    const terminalStatus = updated.status;
    if (terminalStatus !== 'approved' && terminalStatus !== 'rejected') return;

    const lookup = this.authorLookup;
    const notifier = this.notifier;

    fireAndForget(
      (async (): Promise<void> => {
        const author = await lookup(updated.userId);
        if (!author) {
          logger.warn('review_moderation_notify_skipped', {
            reason: 'author_not_found',
            reviewId: updated.id,
          });
          return;
        }
        if (!author.notifyOnReviewModeration) return;

        await notifier.notify({
          recipientEmail: author.email,
          recipientName: author.firstname ?? updated.userName,
          reviewId: updated.id,
          rating: updated.rating,
          comment: updated.comment,
          afterStatus: terminalStatus,
          locale: DEFAULT_EMAIL_LOCALE,
        });
      })(),
      'review_moderation_notify_failed',
    );
  }
}
