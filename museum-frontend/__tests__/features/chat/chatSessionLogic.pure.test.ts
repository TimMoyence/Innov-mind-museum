import { decideMarkdownLinkAction } from '@/features/chat/application/chatSessionLogic.pure';

describe('decideMarkdownLinkAction', () => {
  it('returns "in-app" for https URLs', () => {
    expect(decideMarkdownLinkAction('https://www.capc-bordeaux.fr')).toBe('in-app');
  });

  it('returns "ignore" for http URLs (downgrade attack rejection)', () => {
    expect(decideMarkdownLinkAction('http://example.com')).toBe('ignore');
  });

  it('returns "system" for mailto: links', () => {
    expect(decideMarkdownLinkAction('mailto:contact@museum.fr')).toBe('system');
  });

  it('returns "system" for tel: links', () => {
    expect(decideMarkdownLinkAction('tel:+33123456789')).toBe('system');
  });

  it('returns "system" for sms: links', () => {
    expect(decideMarkdownLinkAction('sms:+33123456789')).toBe('system');
  });

  it('returns "ignore" for empty string', () => {
    expect(decideMarkdownLinkAction('')).toBe('ignore');
  });

  it('returns "ignore" for null', () => {
    expect(decideMarkdownLinkAction(null)).toBe('ignore');
  });

  it('returns "ignore" for undefined', () => {
    expect(decideMarkdownLinkAction(undefined)).toBe('ignore');
  });

  it.each([
    'intent://scan/#Intent;scheme=zxing;end',
    'app-scheme://deeplink/hijack',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'content://com.android.providers/x',
    'about:blank',
    'ftp://anon@evil/x',
  ])('returns "ignore" for dangerous scheme %s', (url) => {
    expect(decideMarkdownLinkAction(url)).toBe('ignore');
  });

  it('returns "ignore" for a malformed / unparseable URL', () => {
    expect(decideMarkdownLinkAction('http://[::::')).toBe('ignore');
    expect(decideMarkdownLinkAction('not a url at all')).toBe('ignore');
  });

  it('regression: in-app action implies caller must return `false` from onLinkPress', () => {
    const action = decideMarkdownLinkAction('https://example.com');
    expect(action).toBe('in-app');
  });
});
