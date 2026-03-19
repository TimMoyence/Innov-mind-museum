import type { EmailService } from './email.port';

/** Brevo (formerly Sendinblue) transactional email service implementation. */
export class BrevoEmailService implements EmailService {
  constructor(private readonly apiKey: string) {}

  /**
   * Send a single transactional email via Brevo REST API.
   * @param to - Recipient email address.
   * @param subject - Email subject line.
   * @param htmlContent - HTML body content.
   */
  async sendEmail(to: string, subject: string, htmlContent: string): Promise<void> {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'Musaium', email: 'noreply@musaium.app' },
        to: [{ email: to }],
        subject,
        htmlContent,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Brevo email failed (${response.status}): ${body.slice(0, 200)}`);
    }
  }
}
