import crypto from 'crypto';
import { IUserRepository } from '../domain/user.repository.interface';
import { User } from '../domain/user.entity';
import { validateEmail } from '../../adapters/secondary/email.service';
import { validatePassword } from '@shared/validation/password';
import { validateNameField } from '@shared/validation/input';
import { badRequest } from '@shared/errors/app.error';
import type { EmailService } from '@shared/email/email.port';
import { logger } from '@shared/logger/logger';

/** Orchestrates new user registration with email/password. */
export class RegisterUseCase {
  constructor(
    private userRepository: IUserRepository,
    private emailService?: EmailService,
    private frontendUrl?: string,
  ) {}

  /**
   * Validate email format, password strength, and name fields, then register a new user.
   * Sends a verification email if an email service is configured (non-blocking).
   * @param email - The user's email address.
   * @param password - The user's chosen password.
   * @param firstname - Optional first name.
   * @param lastname - Optional last name.
   * @returns The newly created user.
   * @throws {AppError} 400 if validation fails.
   */
  async execute(
    email: string,
    password: string,
    firstname?: string,
    lastname?: string,
  ): Promise<User> {
    const normalizedEmail = email.trim().toLowerCase();

    if (!validateEmail(normalizedEmail)) {
      throw badRequest('Invalid email format');
    }

    const pw = validatePassword(password);
    if (!pw.valid) {
      throw badRequest(pw.reason!);
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
      const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      await this.userRepository.setVerificationToken(user.id, token, expires);

      if (this.emailService && this.frontendUrl) {
        const verifyLink = `${this.frontendUrl}/verify-email?token=${token}`;
        const htmlContent =
          '<h1>Verify your email</h1>'
          + '<p>Welcome to Musaium! Click the link below to verify your email address.</p>'
          + `<p><a href="${verifyLink}">${verifyLink}</a></p>`
          + '<p>This link expires in 24 hours. If you did not create an account, you can safely ignore this email.</p>';
        await this.emailService.sendEmail(normalizedEmail, 'Verify your Musaium email', htmlContent);
      } else {
        logger.info('verification_token_generated', { userId: user.id, token });
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
