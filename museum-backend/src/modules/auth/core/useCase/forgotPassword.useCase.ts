import { IUserRepository } from '../domain/user.repository.interface';
import crypto from 'crypto';
import type { EmailService } from '@shared/email/email.port';
import { logger } from '@shared/logger/logger';

/** Orchestrates the "forgot password" flow: generates a reset token if the user exists. */
export class ForgotPasswordUseCase {
  constructor(
    private userRepository: IUserRepository,
    private emailService?: EmailService,
    private frontendUrl?: string,
  ) {}

  /**
   * Generate a password-reset token for the given email.
   * If an email service is configured, sends a reset link; otherwise logs the token (dev only).
   * Returns `undefined` silently if the user does not exist (to prevent enumeration).
   * @param email - The email to initiate reset for.
   * @returns The reset token string, or `undefined` if the user was not found.
   */
  async execute(email: string): Promise<string | undefined> {
    const normalizedEmail = email?.trim().toLowerCase() || '';
    if (!normalizedEmail) return;

    const user = await this.userRepository.getUserByEmail(normalizedEmail);
    if (!user) return;

    const token = crypto.randomBytes(20).toString('hex');
    const expires = new Date(Date.now() + 3600000); // 1 hour expiration
    await this.userRepository.setResetToken(normalizedEmail, token, expires);

    if (this.emailService && this.frontendUrl) {
      const resetLink = this.frontendUrl + '/reset-password?token=' + token;
      const htmlContent = '<h1>Reset your password</h1>'
        + '<p>Click the link below to reset your Musaium password. This link expires in 1 hour.</p>'
        + '<p><a href="' + resetLink + '">' + resetLink + '</a></p>'
        + '<p>If you did not request this, you can safely ignore this email.</p>';
      try {
        await this.emailService.sendEmail(normalizedEmail, 'Reset your Musaium password', htmlContent);
      } catch (error) {
        logger.warn('forgot_password_email_failed', {
          email: normalizedEmail,
          error: (error as Error).message,
        });
      }
    } else {
      logger.info('forgot_password_token', { email: normalizedEmail, token });
    }

    return token;
  }
}
