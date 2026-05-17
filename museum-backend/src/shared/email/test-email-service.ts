import type { EmailService } from './email.port';

export interface CapturedEmail {
  to: string;
  subject: string;
  html: string;
  sentAt: Date;
}

/**
 * Test-only in-memory recording. Prod wiring blocks via
 * `AUTH_EMAIL_SERVICE_KIND` sentinel (config/env.ts).
 * Use {@link findVerificationTokenFor} for tokens in e2e.
 */
export class TestEmailService implements EmailService {
  private readonly emails: CapturedEmail[] = [];

  // eslint-disable-next-line @typescript-eslint/require-await -- no-op implementation of async EmailService interface; synchronous push is intentional
  async sendEmail(to: string, subject: string, htmlContent: string): Promise<void> {
    this.emails.push({
      to,
      subject,
      html: htmlContent,
      sentAt: new Date(),
    });
  }

  /** Most recent last. */
  all(): readonly CapturedEmail[] {
    return [...this.emails];
  }

  /** Most recent email to `address` with `?token=` or `&token=` URL param. */
  findVerificationTokenFor(address: string): string | null {
    for (let i = this.emails.length - 1; i >= 0; i -= 1) {
      const e = this.emails[i];
      if (e.to !== address) continue;
      const match = /[?&]token=([A-Za-z0-9_-]+)/.exec(e.html);
      if (match) return match[1];
    }
    return null;
  }

  /** Call between e2e tests. */
  reset(): void {
    this.emails.length = 0;
  }
}
