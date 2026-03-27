import crypto from 'node:crypto';

import bcrypt from 'bcrypt';

import { AppError, badRequest } from '@shared/errors/app.error';
import { logger } from '@shared/logger/logger';
import { validateEmail } from '@shared/validation/email';
import { env } from '@src/config/env';

import type { IUserRepository } from '../domain/user.repository.interface';
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
   * @returns The plain-text token (useful in dev/test; production relies on email).
   */
  async execute(userId: number, newEmail: string, currentPassword: string): Promise<string> {
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
      const confirmLink = `${this.frontendUrl}/confirm-email-change?token=${token}`;
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
      if (env.nodeEnv !== 'production') {
        logger.info('change_email_token', { userId, token });
      }
    }

    return token;
  }
}
