import {
  buildChangeEmailEmail,
  buildResetPasswordEmail,
  buildReviewModerationEmail,
  buildSupportContactEmail,
  buildVerifyEmail,
} from '@shared/email/templates';

const URL_TOKEN_REGEX = /[?&]token=([A-Za-z0-9_-]+)/;

describe('buildVerifyEmail', () => {
  const verifyUrl = 'https://musaium.com/en/verify-email?token=verify123';

  it('embeds the verify URL in href and as plaintext fallback', () => {
    const html = buildVerifyEmail({ verifyUrl, locale: 'en' });
    const matches = html.match(/verify123/g);
    expect((matches ?? []).length).toBeGreaterThanOrEqual(2);
    const tokenMatch = URL_TOKEN_REGEX.exec(html);
    expect(tokenMatch?.[1]).toBe('verify123');
  });

  it('renders English copy when locale=en', () => {
    const html = buildVerifyEmail({ verifyUrl, locale: 'en' });
    expect(html).toContain('Welcome to Musaium');
    expect(html).toContain('Verify my email');
  });

  it('renders French copy when locale=fr', () => {
    const html = buildVerifyEmail({ verifyUrl, locale: 'fr' });
    expect(html).toContain('Bienvenue sur Musaium');
    expect(html).toContain('Vérifier mon email');
  });
});

describe('buildResetPasswordEmail', () => {
  const resetUrl = 'https://musaium.com/en/reset-password?token=reset456';

  it('embeds the reset URL twice (CTA + fallback)', () => {
    const html = buildResetPasswordEmail({ resetUrl, locale: 'en' });
    const matches = html.match(/reset456/g);
    expect((matches ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('mentions 1-hour expiration and security disclaimer', () => {
    const html = buildResetPasswordEmail({ resetUrl, locale: 'en' });
    expect(html).toContain('1 hour');
    expect(html).toContain('did not request');
  });
});

describe('buildChangeEmailEmail', () => {
  const confirmUrl = 'https://musaium.com/en/confirm-email-change?token=change789';

  it('embeds the confirm URL twice', () => {
    const html = buildChangeEmailEmail({ confirmUrl, locale: 'en' });
    const matches = html.match(/change789/g);
    expect((matches ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('mentions 1-hour expiration', () => {
    const html = buildChangeEmailEmail({ confirmUrl, locale: 'en' });
    expect(html).toContain('1 hour');
  });
});

describe('buildSupportContactEmail', () => {
  const basePayload = {
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    message: 'I have a question.',
  };

  it('escapes XSS attempts in user-controlled fields', () => {
    const html = buildSupportContactEmail({
      ...basePayload,
      name: '<script>alert(1)</script>',
      message: 'Hello <b>world</b>',
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;b&gt;world&lt;/b&gt;');
  });

  it('replaces newlines with <br/> in message', () => {
    const html = buildSupportContactEmail({
      ...basePayload,
      message: 'Line one\nLine two',
    });
    expect(html).toContain('Line one<br/>Line two');
  });

  it('renders all fields with default fallback values when optional fields omitted', () => {
    const html = buildSupportContactEmail(basePayload);
    expect(html).toContain('Ada Lovelace');
    expect(html).toContain('ada@example.com');
    expect(html).toContain('unknown');
    expect(html).toContain('n/a');
  });

  it('renders provided optional fields when present', () => {
    const html = buildSupportContactEmail({
      ...basePayload,
      ip: '192.0.2.1',
      requestId: 'req-abc',
      userAgent: 'TestAgent/1.0',
    });
    expect(html).toContain('192.0.2.1');
    expect(html).toContain('req-abc');
    expect(html).toContain('TestAgent/1.0');
  });
});

describe('buildReviewModerationEmail', () => {
  const baseInput = {
    recipientName: 'Camille',
    rating: 4,
    comment: 'Great visit',
    locale: 'fr' as const,
    status: 'approved' as const,
  };

  it('renders FR approved with comment blockquote', () => {
    const html = buildReviewModerationEmail(baseInput);
    expect(html).toContain('Votre avis est en ligne');
    expect(html).toContain('Camille');
    expect(html).toContain('Great visit');
    expect(html).toContain('Publié');
  });

  it('renders FR rejected without echoing comment', () => {
    const html = buildReviewModerationEmail({ ...baseInput, status: 'rejected' });
    expect(html).toContain('Votre avis n');
    expect(html).not.toContain('Great visit');
    expect(html).toContain('Refusé');
  });

  it('renders EN approved', () => {
    const html = buildReviewModerationEmail({ ...baseInput, locale: 'en' });
    expect(html).toContain('Your review is live');
    expect(html).toContain('Published');
  });

  it('renders EN rejected', () => {
    const html = buildReviewModerationEmail({ ...baseInput, locale: 'en', status: 'rejected' });
    expect(html).toContain('Your review was not published');
    expect(html).toContain('Rejected');
  });

  it('escapes HTML in recipientName and comment', () => {
    const html = buildReviewModerationEmail({
      ...baseInput,
      recipientName: '<script>alert(1)</script>',
      comment: 'Great <b>museum</b>',
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;b&gt;museum&lt;/b&gt;');
  });

  it('renders the rating value in the body', () => {
    const html = buildReviewModerationEmail({ ...baseInput, rating: 3 });
    expect(html).toContain('3/5');
  });

  it('clamps out-of-range rating safely', () => {
    expect(() => buildReviewModerationEmail({ ...baseInput, rating: -1 })).not.toThrow();
    expect(() => buildReviewModerationEmail({ ...baseInput, rating: 99 })).not.toThrow();
  });
});
