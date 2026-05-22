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

/** French digital majority (CNIL Délibération 2021-018). Below this, FE must route to parental-consent. */
const MINIMUM_AGE_FOR_REGISTRATION = 15;

const calculateAgeYears = (dob: Date, now: Date = new Date()): number => {
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - dob.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < dob.getUTCDate())) {
    age -= 1;
  }
  return age;
};

export interface RegisterInput {
  email: string;
  password: string;
  firstname?: string;
  lastname?: string;
  locale?: EmailLocale;
  /** YYYY-MM-DD. When present, gates on CNIL digital-majority age. */
  dateOfBirth?: string;
  /** Forwarded to consent audit row (S4-P0-02 forensics). */
  ip?: string | null;
  requestId?: string | null;
}

export class RegisterUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly emailService?: EmailService,
    private readonly frontendUrl?: string,
    private readonly grantConsentUseCase?: GrantConsentUseCase,
  ) {}

  /** @throws {AppError} 400 validation, 422 if below digital-majority age. */
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

    // F10 — block known-breached passwords via HIBP k-anonymity. Throws
    // AppError(PASSWORD_BREACHED, 400) on hit; fails open with Sentry warning
    // if HIBP unavailable (no SLA).
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

    await this.recordTosConsent(user.id, {
      ip: input.ip ?? null,
      requestId: input.requestId ?? null,
    });
    await this.sendVerificationEmail(
      user.id,
      normalizedEmail,
      input.locale ?? DEFAULT_EMAIL_LOCALE,
    );

    return user;
  }

  /**
   * CNIL Délibération 2021-018 — stable code so FE can route to parental-consent
   * screen instead of showing a generic validation error.
   */
  private assertDigitalMajority(dateOfBirth: string | undefined): void {
    // A2 (design D2) — defence in depth: the Zod schema is the primary R3 gate
    // (returns 400), but a falsy DOB reaching here MUST hard-fail rather than
    // silently bypass the age check. Never parse `undefined` into `new Date(...)`.
    if (!dateOfBirth) {
      throw badRequest('dateOfBirth is required');
    }
    const parsed = new Date(`${dateOfBirth}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) {
      throw badRequest('Invalid dateOfBirth');
    }
    if (calculateAgeYears(parsed) < MINIMUM_AGE_FOR_REGISTRATION) {
      throw new AppError({
        message:
          'Standalone registration is not available below 15 years; parental consent is required.',
        statusCode: 422,
        code: 'MINOR_PARENTAL_CONSENT_REQUIRED',
      });
    }
  }

  /**
   * GDPR — records ToS/privacy at POLICY_VERSION. FE blocks submit unless GDPR
   * checkbox ticked, so reaching here is proof of consent. Failure logged but
   * does NOT abort registration (legal proof is on FE; missing row surfaces in
   * DPO dashboards).
   */
  private async recordTosConsent(
    userId: number,
    auditContext?: { ip?: string | null; requestId?: string | null },
  ): Promise<void> {
    if (!this.grantConsentUseCase) return;
    try {
      await this.grantConsentUseCase.execute(
        userId,
        'tos_privacy',
        POLICY_VERSION,
        'registration',
        auditContext,
      );
    } catch (error) {
      logger.error('registration_consent_record_failed', {
        userId,
        policyVersion: POLICY_VERSION,
        error: (error as Error).message,
      });
    }
  }

  /** Non-blocking. SEC (H2): raw token emailed, SHA-256 hash persisted (mirrors reset flow). */
  private async sendVerificationEmail(
    userId: number,
    email: string,
    locale: EmailLocale,
  ): Promise<void> {
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
