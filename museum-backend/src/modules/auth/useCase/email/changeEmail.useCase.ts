import crypto from 'node:crypto';

import bcrypt from 'bcrypt';

import { DEFAULT_EMAIL_LOCALE, type EmailLocale } from '@shared/email/email-locale';
import { AppError, badRequest } from '@shared/errors/app.error';
import { logger } from '@shared/logger/logger';
import { validateEmail } from '@shared/validation/email';

import type { IUserRepository } from '../../domain/user/user.repository.interface';
import type { EmailService } from '@shared/email/email.port';

/**
 * Initiates the email change flow: verifies current password, checks availability
 * of the new email, generates a confirmation token, and sends a verification email.
 */
export class ChangeEmailUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly emailService?: EmailService,
    private readonly frontendUrl?: string,
  ) {}

  /**
   * Start the email change process.
   *
   * @param userId - The authenticated user's ID.
   * @param newEmail - The desired new email address.
   * @param currentPassword - The user's current password for re-authentication.
   * @param locale - Email locale for building the confirmation URL (defaults to `'fr'`).
   * @returns The plain-text token (useful in dev/test; production relies on email).
   */
  async execute(
    userId: number,
    newEmail: string,
    currentPassword: string,
    locale: EmailLocale = DEFAULT_EMAIL_LOCALE,
  ): Promise<string> {
    const user = await this.userRepository.getUserById(userId);
    if (!user) {
      throw new AppError({ message: 'User not found', statusCode: 404, code: 'NOT_FOUND' });
    }

    if (!user.password) {
      throw badRequest('Cannot change email for social-only accounts');
    }

    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      throw badRequest('Current password is incorrect');
    }

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

    // Generate token: 32 random bytes → hex string; store SHA-256 hash in DB
    const token = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const expires = new Date(Date.now() + 3600000); // 1 hour

    await this.userRepository.setEmailChangeToken(userId, hashedToken, normalizedEmail, expires);

    if (this.emailService && this.frontendUrl) {
      const confirmLink = `${this.frontendUrl}/${locale}/confirm-email-change?token=${token}`;
      const htmlContent =
        '<h1>Confirm your email change</h1>' +
        '<p>You requested to change your Musaium email address. Click the link below to confirm.</p>' +
        `<p><a href="${confirmLink}">${confirmLink}</a></p>` +
        '<p>This link expires in 1 hour. If you did not request this change, you can safely ignore this email.</p>';
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
