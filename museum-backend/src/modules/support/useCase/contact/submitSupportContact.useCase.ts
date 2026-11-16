import { isEmail, TEXT_LIMITS } from '@musaium/shared';

import { invalidInput } from '@shared/errors/app.error';
import { screenSubmission } from '@shared/validation/screen-submission';
import { assertWithinLimit } from '@shared/validation/text-field';

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
    assertWithinLimit('name', name, TEXT_LIMITS.contactName);

    const email = input.email.trim().toLowerCase();
    if (!isEmail(email)) {
      throw invalidInput('email must be valid');
    }

    const message = input.message.trim();
    assertWithinLimit('message', message, TEXT_LIMITS.contactMessage);

    const verdict = screenSubmission(input, 'support_contact');
    if (verdict === 'bot') return;

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
