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

  // Mutation kill — Stryker survivor in verify-email.template.ts L46:20
  // (bodyHtml template literal must NOT mutate to empty backtick string ``).
  // If bodyHtml becomes '', the lead/expires/ignored copy disappears from the rendered HTML
  // (whereas heading + CTA label come from renderEmailLayout's other inputs and would still render).
  it('embeds the EN bodyHtml copy (lead + expires + ignored) inside the body card', () => {
    const html = buildVerifyEmail({ verifyUrl, locale: 'en' });
    expect(html).toContain(
      'Confirm your email address to activate your account and resume your visits whenever you want.',
    );
    expect(html).toContain('This link expires in 24 hours.');
    expect(html).toContain(
      'If you did not create a Musaium account, you can safely ignore this email.',
    );
  });

  it('embeds the FR bodyHtml copy (lead + expires + ignored) inside the body card', () => {
    const html = buildVerifyEmail({ verifyUrl, locale: 'fr' });
    expect(html).toContain(
      'Confirmez votre adresse email pour activer votre compte et reprendre vos visites quand vous le souhaitez.',
    );
    expect(html).toContain('Ce lien expire dans 24 heures.');
    expect(html).toContain(
      "Si vous n'avez pas créé de compte Musaium, vous pouvez ignorer ce message en toute tranquillité.",
    );
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

  // Mutation kill — Stryker survivor in support-contact.template.ts L28:41
  // ('unknown' for IP default must NOT mutate to '').
  // Anchored to the IP <code> cell to differentiate from the userAgent 'unknown'.
  it('renders the literal "unknown" inside the IP <code> cell when ip is omitted (userAgent set to something distinct)', () => {
    const html = buildSupportContactEmail({
      ...basePayload,
      ip: undefined,
      requestId: 'req-distinct',
      userAgent: 'TestAgent/9.9',
    });
    // The IP row's <code> tag must wrap exactly the literal 'unknown'.
    expect(html).toContain(
      '<code style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;color:#475569;">unknown</code>',
    );
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
