import crypto from 'node:crypto';

import { DEFAULT_EMAIL_LOCALE, type EmailLocale } from '@shared/email/email-locale';
import { badRequest } from '@shared/errors/app.error';
import { logger } from '@shared/logger/logger';
import { validateEmail } from '@shared/validation/email';
import { validateNameField } from '@shared/validation/input';
import { validatePassword } from '@shared/validation/password';

import type { User } from '../domain/user.entity';
import type { IUserRepository } from '../domain/user.repository.interface';
import type { EmailService } from '@shared/email/email.port';

/** Orchestrates new user registration with email/password. */
export class RegisterUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly emailService?: EmailService,
    private readonly frontendUrl?: string,
  ) {}

  /**
   * Validate email format, password strength, and name fields, then register a new user.
   * Sends a verification email if an email service is configured (non-blocking).
   *
   * @param email - The user's email address.
   * @param password - The user's chosen password.
   * @param firstname - Optional first name.
   * @param lastname - Optional last name.
   * @param locale - Email locale for building the verification URL (defaults to `'fr'`).
   * @returns The newly created user.
   * @throws {AppError} 400 if validation fails.
   */
  async execute(
    email: string,
    password: string,
    firstname?: string,
    lastname?: string,
    locale: EmailLocale = DEFAULT_EMAIL_LOCALE,
  ): Promise<User> {
    const normalizedEmail = email.trim().toLowerCase();

    if (!validateEmail(normalizedEmail)) {
      throw badRequest('Invalid email format');
    }

    const pw = validatePassword(password);
    if (!pw.valid) {
      throw badRequest(pw.reason ?? 'Invalid password');
    }

    let sanitizedFirstname: string | undefined;
    let sanitizedLastname: string | undefined;
    try {
      sanitizedFirstname = validateNameField(firstname, 'firstname');
      sanitizedLastname = validateNameField(lastname, 'lastname');
    } catch (error) {
      throw badRequest((error as Error).message);
    }

    const user = await this.userRepository.registerUser(
      normalizedEmail,
      password,
      sanitizedFirstname,
      sanitizedLastname,
    );

    // Send verification email (non-blocking — registration succeeds even if this fails)
    try {
      const token = crypto.randomBytes(32).toString('hex');
      // SEC (H2): send raw token in email, persist only SHA-256 hash (mirrors reset password flow)
      const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
      const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      await this.userRepository.setVerificationToken(user.id, hashedToken, expires);

      if (this.emailService && this.frontendUrl) {
        const verifyLink = `${this.frontendUrl}/${locale}/verify-email?token=${token}`;
        const htmlContent =
          '<h1>Verify your email</h1>' +
          '<p>Welcome to Musaium! Click the link below to verify your email address.</p>' +
          `<p><a href="${verifyLink}">${verifyLink}</a></p>` +
          '<p>This link expires in 24 hours. If you did not create an account, you can safely ignore this email.</p>';
        await this.emailService.sendEmail(
          normalizedEmail,
          'Verify your Musaium email',
          htmlContent,
        );
      } else {
        logger.warn('verification_email_skipped_no_service', {
          userId: user.id,
          hint: 'Configure BREVO_API_KEY + FRONTEND_URL or a dev mail catcher (MailHog/Mailpit)',
        });
      }
    } catch (error) {
      logger.warn('verification_email_failed', {
        userId: user.id,
        error: (error as Error).message,
      });
    }

    return user;
  }
}
