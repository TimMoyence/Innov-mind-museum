import { logger } from '@shared/logger/logger';

import type {
  ReviewModerationNotifier,
  ReviewModerationPayload,
} from '../../../domain/ports/review-moderation-notifier.port';
import type { EmailService } from '@shared/email/email.port';

/** Escapes a string for safe HTML embedding in the email body. */
const escapeHtml = (value: string): string => {
  // nosemgrep: javascript.audit.detect-replaceall-sanitization.detect-replaceall-sanitization -- intentional HTML-entity escape chain for server-side email template; order matters (& must be first)
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
};

/** FR + EN copy for review-moderation emails. */
interface LocaleCopy {
  subject: (status: 'approved' | 'rejected') => string;
  heading: (status: 'approved' | 'rejected') => string;
  body: (name: string, rating: number, status: 'approved' | 'rejected') => string;
  footer: string;
}

const LOCALES: Record<'fr' | 'en', LocaleCopy> = {
  fr: {
    subject: (status) =>
      status === 'approved' ? 'Votre avis a été publié' : 'Votre avis a été refusé',
    heading: (status) => (status === 'approved' ? 'Avis publié' : 'Avis refusé'),
    body: (name, rating, status) =>
      status === 'approved'
        ? `Bonjour ${name}, merci pour votre retour (${String(rating)}/5) — il est désormais visible publiquement sur Musaium.`
        : `Bonjour ${name}, votre avis (${String(rating)}/5) n'a pas pu être publié en l'état. Notre équipe a décidé de ne pas l'afficher. Vous pouvez nous contacter si vous souhaitez en savoir plus.`,
    footer:
      'Vous recevez cet email car vous avez activé les notifications de modération. Vous pouvez les désactiver à tout moment dans vos paramètres.',
  },
  en: {
    subject: (status) =>
      status === 'approved' ? 'Your review has been published' : 'Your review was rejected',
    heading: (status) => (status === 'approved' ? 'Review published' : 'Review rejected'),
    body: (name, rating, status) =>
      status === 'approved'
        ? `Hello ${name}, thanks for your feedback (${String(rating)}/5) — it is now publicly visible on Musaium.`
        : `Hello ${name}, your review (${String(rating)}/5) could not be published as-is. Our team decided not to display it. Contact us if you'd like more information.`,
    footer:
      'You are receiving this email because you enabled moderation notifications. You can disable them anytime in your settings.',
  },
};

/** Renders the HTML body for a review-moderation email. */
function buildEmailHtml(payload: ReviewModerationPayload): string {
  const copy = LOCALES[payload.locale];
  if (payload.afterStatus === 'pending') {
    throw new Error('review-moderation email requires terminal status (approved|rejected)');
  }
  const status = payload.afterStatus;
  return [
    `<h2>${escapeHtml(copy.heading(status))}</h2>`,
    `<p>${escapeHtml(copy.body(payload.recipientName, payload.rating, status))}</p>`,
    status === 'approved' ? `<blockquote>${escapeHtml(payload.comment)}</blockquote>` : '',
    '<hr/>',
    `<p style="font-size:12px;color:#666">${escapeHtml(copy.footer)}</p>`,
  ].join('');
}

/** Sends review-moderation outcomes to the review author via email. */
export class EmailReviewModerationNotifier implements ReviewModerationNotifier {
  constructor(private readonly emailService: EmailService) {}

  /** Sends one moderation notification through the configured email provider. */
  async notify(payload: ReviewModerationPayload): Promise<void> {
    const copy = LOCALES[payload.locale];
    if (payload.afterStatus === 'pending') return;
    const subject = copy.subject(payload.afterStatus);
    await this.emailService.sendEmail(payload.recipientEmail, subject, buildEmailHtml(payload));
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

// Exported for targeted unit testing.
export const __test = { buildEmailHtml, LOCALES };
