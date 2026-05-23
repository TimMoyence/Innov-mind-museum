import crypto from 'node:crypto';

import { assertPasswordReauth } from '@modules/auth/useCase/shared/assertPasswordReauth';
import { DEFAULT_EMAIL_LOCALE, type EmailLocale } from '@shared/email/email-locale';
import { buildChangeEmailEmail } from '@shared/email/templates';
import { badRequest } from '@shared/errors/app.error';
import { logger } from '@shared/logger/logger';
import { validateEmail } from '@shared/validation/email';

import type { IUserRepository } from '@modules/auth/domain/user/user.repository.interface';
import type { EmailService } from '@shared/email/email.port';

export class ChangeEmailUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly emailService?: EmailService,
    private readonly frontendUrl?: string,
  ) {}

  /** @returns plain-text token (useful in dev/test; prod relies on email). */
  async execute(
    userId: number,
    newEmail: string,
    currentPassword: string,
    locale: EmailLocale = DEFAULT_EMAIL_LOCALE,
  ): Promise<string> {
    const user = await assertPasswordReauth(this.userRepository, userId, currentPassword);

    const normalizedEmail = newEmail.trim().toLowerCase();

    if (!validateEmail(normalizedEmail)) {
      throw badRequest('Invalid email format');
    }

    if (normalizedEmail === user.email) {
      throw badRequest('New email must be different from current email');
    }

    const existing = await this.userRepository.getUserByEmail(normalizedEmail);
    if (existing) {
      throw badRequest('This email is already in use');
    }

    // 32-byte raw → hex; SHA-256 hash persisted (raw sent in email).
    const token = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const expires = new Date(Date.now() + 3600000); // 1 hour

    await this.userRepository.setEmailChangeToken(userId, hashedToken, normalizedEmail, expires);

    if (this.emailService && this.frontendUrl) {
      const confirmLink = `${this.frontendUrl}/${locale}/confirm-email-change?token=${token}`;
      const htmlContent = buildChangeEmailEmail({ confirmUrl: confirmLink, locale });
      try {
        await this.emailService.sendEmail(
          normalizedEmail,
          'Confirm your Musaium email change',
          htmlContent,
        );
      } catch (error) {
        logger.warn('change_email_send_failed', {
          userId,
          error: (error as Error).message,
        });
      }
    } else {
      logger.warn('change_email_email_skipped_no_service', {
        userId,
        hint: 'Configure BREVO_API_KEY + FRONTEND_URL or a dev mail catcher (MailHog/Mailpit)',
      });
    }

    return token;
  }
}
