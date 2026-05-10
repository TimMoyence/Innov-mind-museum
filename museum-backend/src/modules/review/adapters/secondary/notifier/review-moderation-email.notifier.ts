import { buildReviewModerationEmail, REVIEW_LOCALES } from '@shared/email/templates';
import { logger } from '@shared/logger/logger';

import type {
  ReviewModerationNotifier,
  ReviewModerationPayload,
} from '@modules/review/domain/ports/review-moderation-notifier.port';
import type { EmailService } from '@shared/email/email.port';

/** Sends review-moderation outcomes to the review author via email. */
export class EmailReviewModerationNotifier implements ReviewModerationNotifier {
  constructor(private readonly emailService: EmailService) {}

  /** Sends one moderation notification through the configured email provider. */
  async notify(payload: ReviewModerationPayload): Promise<void> {
    if (payload.afterStatus === 'pending') return;
    const copy = REVIEW_LOCALES[payload.locale];
    const subject = copy.subject(payload.afterStatus);
    const html = buildReviewModerationEmail({
      recipientName: payload.recipientName,
      rating: payload.rating,
      comment: payload.comment,
      locale: payload.locale,
      status: payload.afterStatus,
    });
    await this.emailService.sendEmail(payload.recipientEmail, subject, html);
  }
}

/** No-op notifier for when email delivery is disabled (dev/local). */
export class NoopReviewModerationNotifier implements ReviewModerationNotifier {
  /** Logs the moderation outcome without sending an email. */
  notify(payload: ReviewModerationPayload): Promise<void> {
    logger.warn('review_moderation_notifier_noop', {
      reviewId: payload.reviewId,
      afterStatus: payload.afterStatus,
    });
    return Promise.resolve();
  }
}
