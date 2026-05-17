import { buildB2bLeadEmail } from '@shared/email/templates';
import { logger } from '@shared/logger/logger';

import type {
  B2bLeadNotifier,
  B2bLeadPayload,
} from '@modules/leads/domain/ports/b2b-lead-notifier.port';
import type { EmailService } from '@shared/email/email.port';

/** R4 §3.4 — emails B2B leads to the configured inbox. */
export class EmailB2bLeadNotifier implements B2bLeadNotifier {
  constructor(
    private readonly emailService: EmailService,
    private readonly b2bInboxEmail: string,
  ) {}

  async notify(payload: B2bLeadPayload): Promise<void> {
    const subject = `[Musaium B2B] ${payload.museum} — ${payload.role} ${payload.name}`.slice(
      0,
      200,
    );
    const html = buildB2bLeadEmail({
      name: payload.name,
      email: payload.email,
      museum: payload.museum,
      role: payload.role,
      message: payload.message,
      ip: payload.ip,
      requestId: payload.requestId,
      userAgent: payload.userAgent,
    });
    await this.emailService.sendEmail(this.b2bInboxEmail, subject, html);
  }
}

/** R14 — local/dev fallback when email delivery is not configured. */
export class NoopB2bLeadNotifier implements B2bLeadNotifier {
  notify(payload: B2bLeadPayload): Promise<void> {
    logger.warn('b2b_lead_notifier_noop', {
      requestId: payload.requestId,
      museum: payload.museum.slice(0, 80),
      role: payload.role,
    });
    return Promise.resolve();
  }
}
