import { decideMarkdownLinkAction } from '@/features/chat/application/chatSessionLogic.pure';

describe('decideMarkdownLinkAction', () => {
  it('returns "in-app" for http URLs', () => {
    expect(decideMarkdownLinkAction('http://example.com')).toBe('in-app');
  });

  it('returns "in-app" for https URLs', () => {
    expect(decideMarkdownLinkAction('https://www.capc-bordeaux.fr')).toBe('in-app');
  });

  it('returns "system" for mailto: links', () => {
    expect(decideMarkdownLinkAction('mailto:contact@museum.fr')).toBe('system');
  });

  it('returns "system" for tel: links', () => {
    expect(decideMarkdownLinkAction('tel:+33123456789')).toBe('system');
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

  // Regression test for the C1 double-open bug from sprint 2 code review.
  // The contract of `@ronradtke/react-native-markdown-display.onLinkPress`
  // is COUNTER-INTUITIVE: returning `true` makes the library ALSO call
  // `Linking.openURL`. So our chat screen MUST translate "in-app" → false.
  it('regression: in-app action implies caller must return `false` from onLinkPress', () => {
    const action = decideMarkdownLinkAction('https://example.com');
    // The chat screen wires this as: if (action === 'in-app') return false
    // If this assertion ever fails or the mapping changes, the screen
    // wiring in [sessionId].tsx must be revisited.
    expect(action).toBe('in-app');
  });
});
