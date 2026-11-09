import { renderEmailLayout } from '@shared/email/templates';

describe('renderEmailLayout', () => {
  it('produces a complete HTML document with DOCTYPE and lang attribute', () => {
    const html = renderEmailLayout({
      heading: 'Hello',
      bodyHtml: '<p>Body</p>',
      locale: 'en',
    });
    expect(html).toContain('<!DOCTYPE html');
    expect(html).toContain('<html xmlns="http://www.w3.org/1999/xhtml" lang="en">');
    expect(html).toContain('</html>');
  });

  it('uses fr lang when locale is fr', () => {
    const html = renderEmailLayout({ heading: 'Bonjour', bodyHtml: '<p>Corps</p>', locale: 'fr' });
    expect(html).toContain('lang="fr"');
  });

  it('renders the brand mark "Musaium" in the header band', () => {
    const html = renderEmailLayout({ heading: 'Hello', bodyHtml: '<p>x</p>' });
    expect(html).toContain('Musaium');
  });

  it('renders the heading inside the body card', () => {
    const html = renderEmailLayout({ heading: 'My heading', bodyHtml: '<p>x</p>' });
    expect(html).toContain('My heading');
  });

  it('renders CTA button with bgcolor matching the brand primary when ctaUrl + ctaLabel provided', () => {
    const html = renderEmailLayout({
      heading: 'h',
      bodyHtml: '<p>x</p>',
      ctaLabel: 'Click me',
      ctaUrl: 'https://example.com/x',
    });
    expect(html).toContain('Click me');
    expect(html).toContain('https://example.com/x');
    expect(html).toContain('#1D4ED8');
  });

  it('renders plaintext fallback link below the CTA', () => {
    const html = renderEmailLayout({
      heading: 'h',
      bodyHtml: '<p>x</p>',
      ctaLabel: 'Verify',
      ctaUrl: 'https://example.com/verify?token=abc123',
    });
    const matches = html.match(/https:\/\/example\.com\/verify\?token=abc123/g);
    expect(matches).not.toBeNull();
    expect((matches ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('does NOT render CTA when ctaLabel or ctaUrl missing', () => {
    const html = renderEmailLayout({ heading: 'h', bodyHtml: '<p>x</p>' });
    expect(html).not.toContain('display:inline-block;background-color:#1D4ED8');
  });

  it('renders the hidden preheader for inbox preview', () => {
    const html = renderEmailLayout({
      heading: 'h',
      bodyHtml: '<p>x</p>',
      preheader: 'Inbox preview text',
    });
    expect(html).toContain('Inbox preview text');
    expect(html).toContain('display:none');
  });

  it('includes mso conditional comments for Outlook', () => {
    const html = renderEmailLayout({
      heading: 'h',
      bodyHtml: '<p>x</p>',
      ctaLabel: 'Click',
      ctaUrl: 'https://example.com',
    });
    expect(html).toContain('<!--[if mso]>');
    expect(html).toContain('<!--[if !mso]>');
  });

  it('renders the footer with brand mention and legal text', () => {
    const html = renderEmailLayout({ heading: 'h', bodyHtml: '<p>x</p>', locale: 'en' });
    expect(html).toContain('Musaium');
    expect(html).toContain('© Musaium 2026');
    expect(html).toContain('no-reply@musaium.com');
  });

  it('renders the footer note when provided', () => {
    const html = renderEmailLayout({
      heading: 'h',
      bodyHtml: '<p>x</p>',
      footerNote: 'Why am I receiving this?',
    });
    expect(html).toContain('Why am I receiving this?');
  });

  it('renders the pastel header gradient (matches mobile lightTheme.pageGradient)', () => {
    const html = renderEmailLayout({ heading: 'h', bodyHtml: '<p>x</p>' });
    expect(html).toContain('#EAF2FF');
    expect(html).toContain('#D5F0FF');
  });

  it('embeds a hosted logo image with alt text', () => {
    const html = renderEmailLayout({ heading: 'h', bodyHtml: '<p>x</p>' });
    expect(html).toMatch(/<img[^>]+src="[^"]+\/images\/logo\.png"[^>]+alt="Musaium"/);
  });

  it('honours the logoUrl override when provided', () => {
    const html = renderEmailLayout({
      heading: 'h',
      bodyHtml: '<p>x</p>',
      logoUrl: 'https://cdn.example.com/custom-logo.png',
    });
    expect(html).toContain('https://cdn.example.com/custom-logo.png');
  });

  it('embeds a mobile @media query for responsive rendering', () => {
    const html = renderEmailLayout({ heading: 'h', bodyHtml: '<p>x</p>' });
    expect(html).toContain('@media screen and (max-width: 600px)');
  });

  describe('mutation-resilience — strict structural assertions', () => {
    it('omits the entire CTA wrapper (margin-top:32px table) when ctaLabel missing', () => {
      const html = renderEmailLayout({
        heading: 'h',
        bodyHtml: '<p>x</p>',
        ctaUrl: 'https://e.com',
      });
      expect(html).not.toContain('margin-top:32px');
      expect(html).not.toContain('Stryker was here!');
      expect(html).toMatch(
        /<\/div>\s*<\/td>\s*<\/tr>\s*<tr>\s*<td style="padding:0 40px 0 40px;">/,
      );
    });

    it('omits the entire CTA wrapper (margin-top:32px table) when ctaUrl missing', () => {
      const html = renderEmailLayout({ heading: 'h', bodyHtml: '<p>x</p>', ctaLabel: 'Go' });
      expect(html).not.toContain('margin-top:32px');
      expect(html).not.toContain('Stryker was here!');
      expect(html).toMatch(
        /<\/div>\s*<\/td>\s*<\/tr>\s*<tr>\s*<td style="padding:0 40px 0 40px;">/,
      );
    });

    it('renders an EMPTY preheader span when preheader not provided', () => {
      const html = renderEmailLayout({ heading: 'h', bodyHtml: '<p>x</p>' });
      expect(html).toMatch(/opacity:0;overflow:hidden;"><\/span>/);
      expect(html).not.toContain('Stryker was here!');
    });

    it('renders the EXACT preheader text when provided', () => {
      const html = renderEmailLayout({
        heading: 'h',
        bodyHtml: '<p>x</p>',
        preheader: 'Specific-preheader-XYZ',
      });
      expect(html).toMatch(/opacity:0;overflow:hidden;">Specific-preheader-XYZ<\/span>/);
    });

    it('uses fallbackUrl verbatim in the CTA fallback link when fallbackUrl provided (differs from ctaUrl)', () => {
      const html = renderEmailLayout({
        heading: 'h',
        bodyHtml: '<p>x</p>',
        ctaLabel: 'Verify',
        ctaUrl: 'https://cta.example.com/path?token=cta-token',
        fallbackUrl: 'https://fallback.example.com/path?token=fallback-token',
      });
      expect(html).toContain(
        'href="https://fallback.example.com/path?token=fallback-token" style="color:#1D4ED8;word-break:break-all;text-decoration:underline;">https://fallback.example.com/path?token=fallback-token</a>',
      );
      const ctaUrlMatches = html.match(/https:\/\/cta\.example\.com\/path\?token=cta-token/g);
      expect((ctaUrlMatches ?? []).length).toBe(2);
    });

    it('falls back to ctaUrl in the CTA fallback link when fallbackUrl undefined', () => {
      const html = renderEmailLayout({
        heading: 'h',
        bodyHtml: '<p>x</p>',
        ctaLabel: 'Verify',
        ctaUrl: 'https://cta.example.com/only?token=only-token',
      });
      const matches = html.match(/https:\/\/cta\.example\.com\/only\?token=only-token/g);
      expect((matches ?? []).length).toBe(4);
      expect(html).toContain(
        'href="https://cta.example.com/only?token=only-token" style="color:#1D4ED8;word-break:break-all;text-decoration:underline;">https://cta.example.com/only?token=only-token</a>',
      );
    });

    it('omits the footer-note row entirely when footerNote not provided', () => {
      const html = renderEmailLayout({ heading: 'h', bodyHtml: '<p>x</p>', locale: 'en' });
      expect(html).not.toContain('Stryker was here!');
      expect(html).not.toContain('padding:0 0 14px 0;font-family');
      expect(html).toMatch(
        /<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">\s*<tr>\s*<td align="center" style="padding:0 0 6px 0;font-family/,
      );
    });

    describe('resolveLogoUrl (indirect via renderEmailLayout)', () => {
      const ORIGINAL_FRONTEND_URL = process.env.FRONTEND_URL;
      afterEach(() => {
        if (ORIGINAL_FRONTEND_URL === undefined) {
          delete process.env.FRONTEND_URL;
        } else {
          process.env.FRONTEND_URL = ORIGINAL_FRONTEND_URL;
        }
      });

      it('builds the logo URL from FRONTEND_URL when logoUrl undefined and FRONTEND_URL set', () => {
        process.env.FRONTEND_URL = 'https://museum-frontend.test';
        const html = renderEmailLayout({ heading: 'h', bodyHtml: '<p>x</p>' });
        expect(html).toContain('src="https://museum-frontend.test/images/logo.png"');
      });

      it('strips a trailing slash from FRONTEND_URL before appending /images/logo.png', () => {
        process.env.FRONTEND_URL = 'https://museum-frontend.test/';
        const html = renderEmailLayout({ heading: 'h', bodyHtml: '<p>x</p>' });
        expect(html).toContain('src="https://museum-frontend.test/images/logo.png"');
        expect(html).not.toContain('//images/logo.png');
      });

      it('falls back to the default logo URL when FRONTEND_URL is an empty string', () => {
        process.env.FRONTEND_URL = '   ';
        const html = renderEmailLayout({ heading: 'h', bodyHtml: '<p>x</p>' });
        expect(html).not.toContain('src="   /images/logo.png"');
        expect(html).toMatch(/src="https?:\/\/[^"]*\/images\/logo\.png"/);
      });
    });
  });
});
