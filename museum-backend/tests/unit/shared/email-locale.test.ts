import {
  DEFAULT_EMAIL_LOCALE,
  localeFromAcceptLanguage,
  resolveEmailLocale,
} from '@shared/email/email-locale';

describe('email-locale', () => {
  describe('resolveEmailLocale — strict allowlist', () => {
    it('returns "fr" for the exact string "fr"', () => {
      expect(resolveEmailLocale('fr')).toBe('fr');
    });

    it('returns "en" for the exact string "en"', () => {
      expect(resolveEmailLocale('en')).toBe('en');
    });

    it.each([
      ['FR (uppercase)', 'FR'],
      ['EN (uppercase)', 'EN'],
      ['unsupported locale', 'de'],
      ['path traversal attempt', '../../admin'],
      ['CRLF injection', 'fr\r\nX-Injected: 1'],
      ['URL-encoded slash', 'fr%2Fadmin'],
      ['empty string', ''],
      ['whitespace', '  fr  '],
      ['number', 123],
      ['null', null],
      ['undefined', undefined],
      ['object', { locale: 'fr' }],
      ['array', ['fr']],
    ])('falls back to the default for %s', (_label, input) => {
      expect(resolveEmailLocale(input)).toBe(DEFAULT_EMAIL_LOCALE);
    });
  });

  describe('localeFromAcceptLanguage — header parsing', () => {
    it('returns default when header is undefined', () => {
      expect(localeFromAcceptLanguage(undefined)).toBe(DEFAULT_EMAIL_LOCALE);
    });

    it('returns default when header is empty', () => {
      expect(localeFromAcceptLanguage('')).toBe(DEFAULT_EMAIL_LOCALE);
    });

    it('matches "en" on word boundary (plain)', () => {
      expect(localeFromAcceptLanguage('en')).toBe('en');
    });

    it('matches "en-US" via word boundary (hyphen is a non-word char)', () => {
      expect(localeFromAcceptLanguage('en-US')).toBe('en');
    });

    it('is case-insensitive', () => {
      expect(localeFromAcceptLanguage('EN-GB')).toBe('en');
    });

    it('does NOT match substrings like "entrepreneur"', () => {
      expect(localeFromAcceptLanguage('entrepreneur')).toBe(DEFAULT_EMAIL_LOCALE);
    });

    it('does NOT match substrings like "frankfurt"', () => {
      expect(localeFromAcceptLanguage('frankfurt')).toBe(DEFAULT_EMAIL_LOCALE);
    });

    it('prefers whichever of fr/en appears first', () => {
      expect(localeFromAcceptLanguage('en,fr')).toBe('en');
      expect(localeFromAcceptLanguage('fr,en')).toBe('fr');
    });

    it('handles typical Accept-Language with q-values — "en" first wins', () => {
      expect(localeFromAcceptLanguage('en-US,fr;q=0.8')).toBe('en');
    });

    it('handles typical Accept-Language with q-values — "fr" first wins', () => {
      expect(localeFromAcceptLanguage('fr;q=0.9,en;q=0.8')).toBe('fr');
    });

    it('caps input length — a 10k header with "en" after byte 300 still falls back to default', () => {
      const longHeader = 'x'.repeat(300) + ',en;q=1';
      expect(localeFromAcceptLanguage(longHeader)).toBe(DEFAULT_EMAIL_LOCALE);
    });

    it('is safe against CRLF-style bytes in the header (output stays constrained to fr/en)', () => {
      const injected = 'fr\r\nX-Forwarded-Host: attacker.com';
      expect(localeFromAcceptLanguage(injected)).toBe('fr');
    });

    it('defaults to fr when neither fr nor en are present', () => {
      expect(localeFromAcceptLanguage('de,es;q=0.8,it;q=0.5')).toBe(DEFAULT_EMAIL_LOCALE);
    });
  });
});
