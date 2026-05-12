import crypto from 'node:crypto';

import { DEFAULT_EMAIL_LOCALE, type EmailLocale } from '@shared/email/email-locale';
import { buildVerifyEmail } from '@shared/email/templates';
import { AppError, badRequest } from '@shared/errors/app.error';
import { POLICY_VERSION } from '@shared/legal/policy-version';
import { logger } from '@shared/logger/logger';
import { validateEmail } from '@shared/validation/email';
import { validateNameField } from '@shared/validation/input';
import { validatePassword } from '@shared/validation/password';
import { assertPasswordNotBreached } from '@shared/validation/password-breach-check';

import type { User } from '@modules/auth/domain/user/user.entity';
import type { IUserRepository } from '@modules/auth/domain/user/user.repository.interface';
import type { GrantConsentUseCase } from '@modules/auth/useCase/consent/grantConsent.useCase';
import type { EmailService } from '@shared/email/email.port';

/**
 * French digital majority (CNIL Délibération 2021-018). Standalone account
 * creation requires the user to be at least this old; below the threshold,
 * the FE flow must route the user to a parental-consent screen instead.
 */
const MINIMUM_AGE_FOR_REGISTRATION = 15;

const calculateAgeYears = (dob: Date, now: Date = new Date()): number => {
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - dob.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < dob.getUTCDate())) {
    age -= 1;
  }
  return age;
};

/** Input contract for {@link RegisterUseCase.execute}. */
export interface RegisterInput {
  email: string;
  password: string;
  firstname?: string;
  lastname?: string;
  /** Email locale for the verification URL. Defaults to {@link DEFAULT_EMAIL_LOCALE}. */
  locale?: EmailLocale;
  /** YYYY-MM-DD. When present, gates the registration on CNIL digital-majority age. */
  dateOfBirth?: string;
}

/** Orchestrates new user registration with email/password. */
export class RegisterUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly emailService?: EmailService,
    private readonly frontendUrl?: string,
    private readonly grantConsentUseCase?: GrantConsentUseCase,
  ) {}

  /**
   * Validate email format, password strength, and name fields, then register a new user.
   * Sends a verification email if an email service is configured (non-blocking).
   *
   * @throws {AppError} 400 if validation fails, 422 if user is below the digital majority age.
   */
  async execute(input: RegisterInput): Promise<User> {
    const normalizedEmail = input.email.trim().toLowerCase();

    if (!validateEmail(normalizedEmail)) {
      throw badRequest('Invalid email format');
    }

    this.assertDigitalMajority(input.dateOfBirth);

    const pw = validatePassword(input.password);
    if (!pw.valid) {
      throw badRequest(pw.reason ?? 'Invalid password');
    }

    // F10 (2026-04-30) — block known-breached passwords at registration via HIBP
    // k-anonymity. Throws AppError(PASSWORD_BREACHED, 400) on hit; fails open
    // with a Sentry warning if HIBP itself is unavailable (no SLA).
    await assertPasswordNotBreached(input.password);

    let sanitizedFirstname: string | undefined;
    let sanitizedLastname: string | undefined;
    try {
      sanitizedFirstname = validateNameField(input.firstname, 'firstname');
      sanitizedLastname = validateNameField(input.lastname, 'lastname');
    } catch (error) {
      throw badRequest((error as Error).message);
    }

    const user = await this.userRepository.registerUser(
      normalizedEmail,
      input.password,
      sanitizedFirstname,
      sanitizedLastname,
      input.dateOfBirth,
    );

    await this.recordTosConsent(user.id);
    await this.sendVerificationEmail(user.id, normalizedEmail, input.locale ?? DEFAULT_EMAIL_LOCALE);

    return user;
  }

  /**
   * CNIL Délibération 2021-018 — reject standalone registration below 15 years.
   * Returns a stable code so the FE can route the user to the parental-consent
   * screen instead of showing a generic validation error.
   */
  private assertDigitalMajority(dateOfBirth: string | undefined): void {
    if (!dateOfBirth) return;
    const parsed = new Date(`${dateOfBirth}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) {
      throw badRequest('Invalid dateOfBirth');
    }
    if (calculateAgeYears(parsed) < MINIMUM_AGE_FOR_REGISTRATION) {
      throw new AppError({
        message: 'Standalone registration is not available below 15 years; parental consent is required.',
        statusCode: 422,
        code: 'MINOR_PARENTAL_CONSENT_REQUIRED',
      });
    }
  }

  /**
   * GDPR — register the ToS/privacy consent at policy version POLICY_VERSION.
   * The mobile/web flows block submission unless the user ticked the GDPR
   * checkbox, so reaching this code path is proof of consent. Audit trail
   * lives in `user_consents`. Failure is logged but does not abort registration
   * (legal proof is on the FE checkbox; missing row will surface in DPO dashboards).
   */
  private async recordTosConsent(userId: number): Promise<void> {
    if (!this.grantConsentUseCase) return;
    try {
      await this.grantConsentUseCase.execute(userId, 'tos_privacy', POLICY_VERSION, 'registration');
    } catch (error) {
      logger.error('registration_consent_record_failed', {
        userId,
        policyVersion: POLICY_VERSION,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Non-blocking verification email. SEC (H2): we email the raw token but
   * persist only its SHA-256 hash, mirroring the reset-password flow.
   */
  private async sendVerificationEmail(userId: number, email: string, locale: EmailLocale): Promise<void> {
    try {
      const token = crypto.randomBytes(32).toString('hex');
      const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
      const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await this.userRepository.setVerificationToken(userId, hashedToken, expires);

      if (this.emailService && this.frontendUrl) {
        const verifyLink = `${this.frontendUrl}/${locale}/verify-email?token=${token}`;
        const htmlContent = buildVerifyEmail({ verifyUrl: verifyLink, locale });
        await this.emailService.sendEmail(email, 'Verify your Musaium email', htmlContent);
      } else {
        logger.warn('verification_email_skipped_no_service', {
          userId,
          hint: 'Configure BREVO_API_KEY + FRONTEND_URL or a dev mail catcher (MailHog/Mailpit)',
        });
      }
    } catch (error) {
      logger.warn('verification_email_failed', {
        userId,
        error: (error as Error).message,
      });
    }
  }
}
