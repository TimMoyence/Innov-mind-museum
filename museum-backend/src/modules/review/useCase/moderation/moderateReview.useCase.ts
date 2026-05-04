import { auditService as defaultAuditService, AUDIT_ADMIN_REVIEW_MODERATED } from '@shared/audit';
import { DEFAULT_EMAIL_LOCALE } from '@shared/email/email-locale';
import { badRequest, notFound } from '@shared/errors/app.error';
import { logger } from '@shared/logger/logger';
import { fireAndForget } from '@shared/utils/fire-and-forget';

import type { ReviewModerationNotifier } from '../../domain/ports/review-moderation-notifier.port';
import type { IReviewRepository } from '../../domain/review/review.repository.interface';
import type { ReviewDTO, ReviewStatus } from '../../domain/review/review.types';
import type { AuditService } from '@shared/audit';

/** Minimal user snapshot needed to build the moderation notification. */
export interface ReviewAuthorSnapshot {
  id: number;
  email: string;
  firstname?: string;
  notifyOnReviewModeration: boolean;
}

/** Async lookup for the review author. Adapter decides how to resolve (PG repo in prod). */
export type ReviewAuthorLookup = (userId: number) => Promise<ReviewAuthorSnapshot | null>;

/** Input for the moderate-review use case. */
export interface ModerateReviewUseCaseInput {
  reviewId: string;
  status: string;
  actorId: number;
  ip?: string;
  requestId?: string;
}

const MODERATION_STATUSES: ReviewStatus[] = ['approved', 'rejected'];

/** Extra dependencies for the moderate-review use case (all optional — safe defaults in prod). */
export interface ModerateReviewUseCaseDeps {
  audit?: Pick<AuditService, 'log'>;
  notifier?: ReviewModerationNotifier;
  authorLookup?: ReviewAuthorLookup;
}

/**
 * Moderates a review (approve/reject), emits an audit log, and — if the author
 * has opted-in — sends a notification email (fire-and-forget).
 *
 * Compliance: SOC2 CC7.2 + GDPR Art. 30 + NIST SP 800-53 AU-2 — every privileged
 * action on user-generated content is auditable. Notification delivery is best-effort
 * so a failed email does not fail the moderation (see ADR-notifications-best-effort).
 */
export class ModerateReviewUseCase {
  private readonly audit: Pick<AuditService, 'log'>;
  private readonly notifier?: ReviewModerationNotifier;
  private readonly authorLookup?: ReviewAuthorLookup;

  constructor(
    private readonly repository: IReviewRepository,
    depsOrAudit: ModerateReviewUseCaseDeps | Pick<AuditService, 'log'> = {},
  ) {
    // Accept either a full deps object OR a bare audit stub (back-compat with existing tests).
    const deps: ModerateReviewUseCaseDeps =
      'log' in depsOrAudit ? { audit: depsOrAudit } : depsOrAudit;
    this.audit = deps.audit ?? defaultAuditService;
    this.notifier = deps.notifier;
    this.authorLookup = deps.authorLookup;
  }

  /** Validates the status enum, updates the review, emits audit, notifies the author. */
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

  /** Best-effort: fire-and-forget email to the author, gated on their opt-in flag. */
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
