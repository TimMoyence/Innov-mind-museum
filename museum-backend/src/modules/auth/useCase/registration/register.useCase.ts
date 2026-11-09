import { isEmail } from '@musaium/shared';

import { DEFAULT_EMAIL_LOCALE, type EmailLocale } from '@shared/email/email-locale';
import { buildVerifyEmail } from '@shared/email/templates';
import { AppError, invalidInput } from '@shared/errors/app.error';
import { POLICY_VERSION } from '@shared/legal/policy-version';
import { logger } from '@shared/logger/logger';
import { issueEmailToken } from '@shared/security/single-use-email-token';
import { validateNameField } from '@shared/validation/input';
import { validatePassword } from '@shared/validation/password';
import { assertPasswordNotBreached } from '@shared/validation/password-breach-check';

import type { User } from '@modules/auth/domain/user/user.entity';
import type { IUserRepository } from '@modules/auth/domain/user/user.repository.interface';
import type { GrantConsentUseCase } from '@modules/auth/useCase/consent/grantConsent.useCase';
import type { EmailService } from '@shared/email/email.port';

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
  dateOfBirth?: string;
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

  async execute(input: RegisterInput): Promise<User> {
    const normalizedEmail = input.email.trim().toLowerCase();

    if (!isEmail(normalizedEmail)) {
      throw invalidInput('Invalid email format');
    }

    this.assertDigitalMajority(input.dateOfBirth);

    const pw = validatePassword(input.password);
    if (!pw.valid) {
      throw invalidInput(pw.reason ?? 'Invalid password');
    }

    let sanitizedFirstname: string | undefined;
    let sanitizedLastname: string | undefined;
    try {
      sanitizedFirstname = validateNameField(input.firstname, 'firstname');
      sanitizedLastname = validateNameField(input.lastname, 'lastname');
    } catch (error) {
      throw invalidInput((error as Error).message);
    }

    await assertPasswordNotBreached(input.password);

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

  private assertDigitalMajority(dateOfBirth: string | undefined): void {
    if (!dateOfBirth) {
      throw invalidInput('dateOfBirth is required');
    }
    const parsed = new Date(`${dateOfBirth}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) {
      throw invalidInput('Invalid dateOfBirth');
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

  private async sendVerificationEmail(
    userId: number,
    email: string,
    locale: EmailLocale,
  ): Promise<void> {
    try {
      const { raw: token, hashed: hashedToken } = issueEmailToken();
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
