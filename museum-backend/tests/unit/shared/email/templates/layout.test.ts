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
    expect(html).toContain('#2563EB');
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
    expect(html).not.toContain('display:inline-block;background-color:#2563EB');
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

  it('uses the custom accentColor when provided', () => {
    const html = renderEmailLayout({
      heading: 'h',
      bodyHtml: '<p>x</p>',
      accentColor: '#C49A3C',
    });
    expect(html).toContain('#C49A3C');
  });

  it('embeds a mobile @media query for responsive rendering', () => {
    const html = renderEmailLayout({ heading: 'h', bodyHtml: '<p>x</p>' });
    expect(html).toContain('@media screen and (max-width: 600px)');
  });
});
