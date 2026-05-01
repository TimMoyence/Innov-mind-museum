import type { EmailService } from './email.port';

/** Represents a single email captured by {@link TestEmailService} during tests. */
export interface CapturedEmail {
  to: string;
  subject: string;
  html: string;
  sentAt: Date;
}

/**
 * Test-only email service that records every send into an in-memory store.
 *
 * Production wiring guards against this being instantiated outside tests via
 * the `AUTH_EMAIL_SERVICE_KIND` env-var sentinel in `config/env.ts`. Use
 * {@link findVerificationTokenFor} to retrieve captured tokens in e2e tests.
 */
export class TestEmailService implements EmailService {
  private readonly emails: CapturedEmail[] = [];

  /**
   * Records the email in the in-memory store. Implements the async EmailService
   * port; no actual I/O is performed.
   */
  // eslint-disable-next-line @typescript-eslint/require-await -- no-op implementation of async EmailService interface; synchronous push is intentional
  async sendEmail(to: string, subject: string, htmlContent: string): Promise<void> {
    this.emails.push({
      to,
      subject,
      html: htmlContent,
      sentAt: new Date(),
    });
  }

  /** Return every captured email (most recent last). */
  all(): readonly CapturedEmail[] {
    return [...this.emails];
  }

  /**
   * Find the most recent email sent to `address` whose body has a `?token=<raw>`
   * or `&token=<raw>` URL parameter.
   */
  findVerificationTokenFor(address: string): string | null {
    for (let i = this.emails.length - 1; i >= 0; i -= 1) {
      const e = this.emails[i];
      if (e.to !== address) continue;
      const match = /[?&]token=([A-Za-z0-9_-]+)/.exec(e.html);
      if (match) return match[1];
    }
    return null;
  }

  /** Wipe captured emails; call between e2e tests. */
  reset(): void {
    this.emails.length = 0;
  }
}
