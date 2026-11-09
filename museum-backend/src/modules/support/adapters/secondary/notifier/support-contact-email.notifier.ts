import { tagSuspect } from '@shared/email/suspect-subject';
import { buildSupportContactEmail } from '@shared/email/templates';
import { logger } from '@shared/logger/logger';

import type {
  SupportContactNotifier,
  SupportContactPayload,
} from '@modules/support/domain/ports/support-contact-notifier.port';
import type { EmailService } from '@shared/email/email.port';

export class EmailSupportContactNotifier implements SupportContactNotifier {
  constructor(
    private readonly emailService: EmailService,
    private readonly supportInboxEmail: string,
  ) {}

  async notify(payload: SupportContactPayload): Promise<void> {
    const subject = tagSuspect(
      `[Musaium Support] ${payload.name} <${payload.email}>`,
      payload.suspect,
    ).slice(0, 200);
    const html = buildSupportContactEmail({
      name: payload.name,
      email: payload.email,
      message: payload.message,
      ip: payload.ip,
      requestId: payload.requestId,
      userAgent: payload.userAgent,
    });
    await this.emailService.sendEmail(this.supportInboxEmail, subject, html);
  }
}

export class NoopSupportContactNotifier implements SupportContactNotifier {
  notify(payload: SupportContactPayload): Promise<void> {
    logger.warn('support_contact_notifier_noop', {
      requestId: payload.requestId,
      hasIp: Boolean(payload.ip),
    });
    return Promise.resolve();
  }
}
