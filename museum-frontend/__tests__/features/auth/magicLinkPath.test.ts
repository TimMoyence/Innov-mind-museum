import { mapMagicLinkPath } from '@/features/auth/lib/magicLinkPath';

describe('mapMagicLinkPath', () => {
  describe('R2 — map magic-link routes, strip locale prefix, preserve query', () => {
    it('maps /fr/verify-email and preserves the token query', () => {
      expect(mapMagicLinkPath('https://musaium.com/fr/verify-email?token=ABC')).toBe(
        '/verify-email?token=ABC',
      );
    });

    it('maps /en/reset-password and preserves URL-encoding byte-for-byte (#1 risk)', () => {
      expect(mapMagicLinkPath('https://musaium.com/en/reset-password?token=xyz%20z')).toBe(
        '/reset-password?token=xyz%20z',
      );
    });

    it('maps /fr/confirm-email-change and preserves the token query', () => {
      expect(mapMagicLinkPath('https://musaium.com/fr/confirm-email-change?token=T0K3N')).toBe(
        '/confirm-email-change?token=T0K3N',
      );
    });

    it('maps the locale-less variant (prefix optional)', () => {
      expect(mapMagicLinkPath('https://musaium.com/verify-email?token=ABC')).toBe(
        '/verify-email?token=ABC',
      );
    });

    it('preserves a multi-param query verbatim', () => {
      expect(mapMagicLinkPath('https://musaium.com/en/reset-password?token=ABC&foo=bar')).toBe(
        '/reset-password?token=ABC&foo=bar',
      );
    });

    it('maps a magic-link route with no query to the bare app route', () => {
      expect(mapMagicLinkPath('https://musaium.com/fr/verify-email')).toBe('/verify-email');
    });
  });

  describe('R3 / R11 — pass-through: any non-magic-link path returned unchanged', () => {
    it.each([
      ['custom-scheme museums-picker deep link', 'musaium:///(stack)/museums-picker'],
      ['non-magic-link HTTPS route', 'https://musaium.com/museums/42'],
      ['locale root with no magic-link segment', 'https://musaium.com/fr'],
      ['root path', '/'],
      ['empty string', ''],
    ])('returns %s unchanged', (_label, input) => {
      expect(mapMagicLinkPath(input)).toBe(input);
    });
  });
});
