import { describeLimit, isEmail, isWithinLimit, TEXT_LIMITS } from '@musaium/shared';

import { invalidInput } from '@shared/errors/app.error';
import { logger } from '@shared/logger/logger';
import { judgeSubmission } from '@shared/validation/honeypot';

import type {
  SupportContactNotifier,
  SupportContactPayload,
} from '@modules/support/domain/ports/support-contact-notifier.port';

interface SubmitSupportContactInput {
  name: string;
  email: string;
  message: string;
  website?: string;
  fillMs?: number;
  ip?: string;
  requestId?: string;
  userAgent?: string;
}

export class SubmitSupportContactUseCase {
  constructor(private readonly notifier: SupportContactNotifier) {}

  async execute(input: SubmitSupportContactInput): Promise<void> {
    const name = input.name.trim();
    if (!isWithinLimit(name, TEXT_LIMITS.contactName)) {
      throw invalidInput(describeLimit('name', TEXT_LIMITS.contactName));
    }

    const email = input.email.trim().toLowerCase();
    if (!isEmail(email)) {
      throw invalidInput('email must be valid');
    }

    const message = input.message.trim();
    if (!isWithinLimit(message, TEXT_LIMITS.contactMessage)) {
      throw invalidInput(describeLimit('message', TEXT_LIMITS.contactMessage));
    }

    const verdict = judgeSubmission(input);
    if (verdict === 'bot') {
      logger.warn('support_contact_honeypot_triggered', {
        requestId: input.requestId,
        hasIp: Boolean(input.ip),
      });
      return;
    }

    const payload: SupportContactPayload = {
      name,
      email,
      message,
      suspect: verdict === 'suspect',
      ip: input.ip,
      requestId: input.requestId,
      userAgent: input.userAgent,
    };
    await this.notifier.notify(payload);
  }
}
