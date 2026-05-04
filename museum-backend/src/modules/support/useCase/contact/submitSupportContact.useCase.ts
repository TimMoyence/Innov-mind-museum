import { badRequest } from '@shared/errors/app.error';
import { validateEmail } from '@shared/validation/email';

import type {
  SupportContactNotifier,
  SupportContactPayload,
} from '@modules/support/domain/ports/support-contact-notifier.port';

/** Input accepted from the public support-contact endpoint. */
interface SubmitSupportContactInput {
  name: string;
  email: string;
  message: string;
  ip?: string;
  requestId?: string;
  userAgent?: string;
}

/** Validates and forwards public support-contact submissions through the notifier port. */
export class SubmitSupportContactUseCase {
  constructor(private readonly notifier: SupportContactNotifier) {}

  /** Validates a public support-contact request and forwards it to the notifier adapter. */
  async execute(input: SubmitSupportContactInput): Promise<void> {
    const name = input.name.trim();
    if (!name || name.length > 120) {
      throw badRequest('name must be between 1 and 120 characters');
    }

    const email = input.email.trim().toLowerCase();
    if (!validateEmail(email)) {
      throw badRequest('email must be valid');
    }

    const message = input.message.trim();
    if (!message || message.length < 10 || message.length > 5000) {
      throw badRequest('message must be between 10 and 5000 characters');
    }

    const payload: SupportContactPayload = {
      name,
      email,
      message,
      ip: input.ip,
      requestId: input.requestId,
      userAgent: input.userAgent,
    };
    await this.notifier.notify(payload);
  }
}
