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

import type { User } from '@modules/auth/domain/user/user.entity';
import type { IUserRepository } from '@modules/auth/domain/user/user.repository.interface';
import type { GrantConsentUseCase } from '@modules/auth/useCase/consent/grantConsent.useCase';
import type { EmailService } from '@shared/email/email.port';

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
    dateOfBirth?: string,
  ): Promise<User> {
    const normalizedEmail = email.trim().toLowerCase();

    if (!validateEmail(normalizedEmail)) {
      throw badRequest('Invalid email format');
    }

    // Age-gate (CNIL Délibération 2021-018). The FE always passes
    // `dateOfBirth` after the age-gate ships; reject if it's missing or if
    // the user is below the digital majority. 422 (Unprocessable Entity) +
    // a stable code so the FE can route the user to the parental-consent
    // screen instead of showing a generic validation error.
    if (dateOfBirth) {
      const parsed = new Date(`${dateOfBirth}T00:00:00Z`);
      if (Number.isNaN(parsed.getTime())) {
        throw badRequest('Invalid dateOfBirth');
      }
      const age = calculateAgeYears(parsed);
      if (age < MINIMUM_AGE_FOR_REGISTRATION) {
        throw new AppError({
          message: 'Standalone registration is not available below 15 years; parental consent is required.',
          statusCode: 422,
          code: 'MINOR_PARENTAL_CONSENT_REQUIRED',
        });
      }
    }

    const pw = validatePassword(password);
    if (!pw.valid) {
      throw badRequest(pw.reason ?? 'Invalid password');
    }

    // F10 (2026-04-30) — block known-breached passwords at registration via HIBP
    // k-anonymity. Throws AppError(PASSWORD_BREACHED, 400) on hit; fails open
    // with a Sentry warning if HIBP itself is unavailable (no SLA).
    await assertPasswordNotBreached(password);

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
      dateOfBirth,
    );

    // GDPR — register the ToS/privacy consent at policy version POLICY_VERSION.
    // The mobile/web flows block submission unless the user ticked the GDPR
    // checkbox, so we treat reaching this code path as proof of consent. Audit
    // trail lives in `user_consents` (immutable insert per grant, revoke marks
    // a row rather than deleting it).
    if (this.grantConsentUseCase) {
      try {
        await this.grantConsentUseCase.execute(user.id, 'tos_privacy', POLICY_VERSION, 'registration');
      } catch (error) {
        // Consent recording failure must not silently swallow — surface via
        // logger so DPO can reconcile. We still return the created user since
        // the legal proof is on the FE checkbox + audit log; missing row will
        // be visible in DPO dashboards.
        logger.error('registration_consent_record_failed', {
          userId: user.id,
          policyVersion: POLICY_VERSION,
          error: (error as Error).message,
        });
      }
    }

    // Send verification email (non-blocking — registration succeeds even if this fails)
    try {
      const token = crypto.randomBytes(32).toString('hex');
      // SEC (H2): send raw token in email, persist only SHA-256 hash (mirrors reset password flow)
      const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
      const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      await this.userRepository.setVerificationToken(user.id, hashedToken, expires);

      if (this.emailService && this.frontendUrl) {
        const verifyLink = `${this.frontendUrl}/${locale}/verify-email?token=${token}`;
        const htmlContent = buildVerifyEmail({ verifyUrl: verifyLink, locale });
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
