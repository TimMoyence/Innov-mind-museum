import { logger } from '@shared/logger/logger';

import type {
  SupportContactNotifier,
  SupportContactPayload,
} from '../../domain/support-contact-notifier.port';
import type { EmailService } from '@shared/email/email.port';

const escapeHtml = (value: string): string => {
  // nosemgrep: javascript.audit.detect-replaceall-sanitization.detect-replaceall-sanitization -- intentional HTML-entity escape chain for server-side email template; order matters (& must be first)
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
};

const buildSupportContactHtml = (payload: SupportContactPayload): string => {
  const safeName = escapeHtml(payload.name);
  const safeEmail = escapeHtml(payload.email);
  const safeMessage = escapeHtml(payload.message).replaceAll('\n', '<br/>');
  const safeIp = escapeHtml(payload.ip ?? 'unknown');
  const safeRequestId = escapeHtml(payload.requestId ?? 'n/a');
  const safeUserAgent = escapeHtml(payload.userAgent ?? 'unknown');

  return [
    '<h2>New Musaium Support Contact</h2>',
    `<p><strong>Name:</strong> ${safeName}</p>`,
    `<p><strong>Email:</strong> ${safeEmail}</p>`,
    `<p><strong>Request ID:</strong> ${safeRequestId}</p>`,
    `<p><strong>IP:</strong> ${safeIp}</p>`,
    `<p><strong>User-Agent:</strong> ${safeUserAgent}</p>`,
    '<hr/>',
    `<p>${safeMessage}</p>`,
  ].join('');
};

/** Sends public support-contact submissions to the configured support inbox. */
export class EmailSupportContactNotifier implements SupportContactNotifier {
  constructor(
    private readonly emailService: EmailService,
    private readonly supportInboxEmail: string,
  ) {}

  /** Sends one support-contact payload through the configured email provider. */
  async notify(payload: SupportContactPayload): Promise<void> {
    const subject = `[Musaium Support] ${payload.name} <${payload.email}>`.slice(0, 200);
    await this.emailService.sendEmail(
      this.supportInboxEmail,
      subject,
      buildSupportContactHtml(payload),
    );
  }
}

/** No-op notifier used when email delivery is not configured (local/dev fallback). */
export class NoopSupportContactNotifier implements SupportContactNotifier {
  /** Logs support-contact submissions when email delivery is disabled. */
  notify(payload: SupportContactPayload): Promise<void> {
    logger.warn('support_contact_notifier_noop', {
      requestId: payload.requestId,
      hasIp: Boolean(payload.ip),
    });
    return Promise.resolve();
  }
}
