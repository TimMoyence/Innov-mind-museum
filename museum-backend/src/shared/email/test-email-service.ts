import type { EmailService } from './email.port';

export interface CapturedEmail {
  to: string;
  subject: string;
  html: string;
  sentAt: Date;
}

export class TestEmailService implements EmailService {
  private readonly emails: CapturedEmail[] = [];

  sendEmail(to: string, subject: string, htmlContent: string): Promise<void> {
    this.emails.push({
      to,
      subject,
      html: htmlContent,
      sentAt: new Date(),
    });

    return Promise.resolve();
  }

  all(): readonly CapturedEmail[] {
    return [...this.emails];
  }

  findVerificationTokenFor(address: string): string | null {
    for (let i = this.emails.length - 1; i >= 0; i -= 1) {
      const e = this.emails[i];
      if (e.to !== address) continue;
      const match = /[?&]token=([A-Za-z0-9_-]+)/.exec(e.html);
      if (match) return match[1];
    }
    return null;
  }

  reset(): void {
    this.emails.length = 0;
  }
}
