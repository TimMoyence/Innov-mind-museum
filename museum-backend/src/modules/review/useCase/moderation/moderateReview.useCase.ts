import { MODERATION_STATUSES } from '@modules/review/domain/review/moderation-statuses';
import { auditService as defaultAuditService, AUDIT_ADMIN_REVIEW_MODERATED } from '@shared/audit';
import { isOutsideMuseumScope } from '@shared/authz/tenant-scope';
import { DEFAULT_EMAIL_LOCALE } from '@shared/email/email-locale';
import { notFound } from '@shared/errors/app.error';
import { logger } from '@shared/logger/logger';
import { fireAndForget } from '@shared/utils/fire-and-forget';
import { assertOneOf } from '@shared/validation/one-of';

import type { ReviewModerationNotifier } from '@modules/review/domain/ports/review-moderation-notifier.port';
import type { IReviewRepository } from '@modules/review/domain/review/review.repository.interface';
import type { ReviewDTO } from '@modules/review/domain/review/review.types';
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
  scopeMuseumId?: number | null;
}

export interface ModerateReviewUseCaseDeps {
  audit?: Pick<AuditService, 'log' | 'logActorAction'>;
  notifier?: ReviewModerationNotifier;
  authorLookup?: ReviewAuthorLookup;
}

export class ModerateReviewUseCase {
  private readonly audit: Pick<AuditService, 'log' | 'logActorAction'>;
  private readonly notifier?: ReviewModerationNotifier;
  private readonly authorLookup?: ReviewAuthorLookup;

  constructor(
    private readonly repository: IReviewRepository,
    depsOrAudit: ModerateReviewUseCaseDeps | Pick<AuditService, 'log' | 'logActorAction'> = {},
  ) {
    const deps: ModerateReviewUseCaseDeps =
      'log' in depsOrAudit ? { audit: depsOrAudit } : depsOrAudit;
    this.audit = deps.audit ?? defaultAuditService;
    this.notifier = deps.notifier;
    this.authorLookup = deps.authorLookup;
  }

  async execute(input: ModerateReviewUseCaseInput): Promise<ReviewDTO> {
    assertOneOf('status', MODERATION_STATUSES, input.status);

    const before = await this.repository.getReviewById(input.reviewId);
    if (!before) {
      throw notFound('Review not found');
    }

    if (isOutsideMuseumScope(input.scopeMuseumId, before.museumId)) {
      throw notFound('Review not found');
    }

    const updated = await this.repository.moderateReview({
      reviewId: input.reviewId,
      status: input.status,
    });

    if (!updated) {
      throw notFound('Review not found');
    }

    await this.audit.logActorAction({
      action: AUDIT_ADMIN_REVIEW_MODERATED,
      actorId: input.actorId,
      targetType: 'review',
      targetId: input.reviewId,
      metadata: {
        beforeStatus: before.status,
        afterStatus: updated.status,
      },
      ip: input.ip,
      requestId: input.requestId,
    });

    this.scheduleAuthorNotification(updated);

    return updated;
  }

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
