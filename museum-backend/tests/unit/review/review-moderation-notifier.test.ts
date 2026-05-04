import {
  EmailReviewModerationNotifier,
  NoopReviewModerationNotifier,
  __test,
} from '@modules/review/adapters/secondary/notifier/review-moderation-email.notifier';

import type { ReviewModerationPayload } from '@modules/review/domain/ports/review-moderation-notifier.port';
import type { EmailService } from '@shared/email/email.port';

const basePayload: ReviewModerationPayload = {
  recipientEmail: 'alice@example.com',
  recipientName: 'Alice',
  reviewId: 'r-1',
  rating: 4,
  comment: 'Nice museum',
  afterStatus: 'approved',
  locale: 'fr',
};

describe('EmailReviewModerationNotifier', () => {
  let emailService: jest.Mocked<EmailService>;

  beforeEach(() => {
    emailService = { sendEmail: jest.fn<Promise<void>, [string, string, string]>() };
    emailService.sendEmail.mockResolvedValue(undefined);
  });

  it('sends an approved-review email in French (default locale)', async () => {
    const notifier = new EmailReviewModerationNotifier(emailService);
    await notifier.notify(basePayload);

    expect(emailService.sendEmail).toHaveBeenCalledTimes(1);
    const [to, subject, html] = emailService.sendEmail.mock.calls[0];
    expect(to).toBe('alice@example.com');
    expect(subject).toBe('Votre avis a été publié');
    expect(html).toContain('Avis publié');
    expect(html).toContain('Alice');
    expect(html).toContain('Nice museum');
  });

  it('sends a rejected-review email in English', async () => {
    const notifier = new EmailReviewModerationNotifier(emailService);
    await notifier.notify({ ...basePayload, afterStatus: 'rejected', locale: 'en' });

    const [, subject, html] = emailService.sendEmail.mock.calls[0];
    expect(subject).toBe('Your review was rejected');
    expect(html).toContain('Review rejected');
    // Rejected emails must NOT echo the original comment (UX decision — do not rub the content in)
    expect(html).not.toContain('Nice museum');
  });

  it('escapes HTML in author-controlled fields (XSS defense)', async () => {
    const notifier = new EmailReviewModerationNotifier(emailService);
    await notifier.notify({
      ...basePayload,
      recipientName: '<script>alert(1)</script>',
      comment: 'Great <b>museum</b>',
    });

    const [, , html] = emailService.sendEmail.mock.calls[0];
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('Great &lt;b&gt;museum&lt;/b&gt;');
  });

  it('throws on pending status (template can only render terminal states)', () => {
    expect(() => __test.buildEmailHtml({ ...basePayload, afterStatus: 'pending' })).toThrow(
      'terminal status',
    );
  });

  it('does NOT send anything when status is pending at send time (defensive)', async () => {
    const notifier = new EmailReviewModerationNotifier(emailService);
    await notifier.notify({ ...basePayload, afterStatus: 'pending' });

    expect(emailService.sendEmail).not.toHaveBeenCalled();
  });
});

describe('NoopReviewModerationNotifier', () => {
  it('resolves without sending anything', async () => {
    const notifier = new NoopReviewModerationNotifier();
    await expect(notifier.notify(basePayload)).resolves.toBeUndefined();
  });
});
