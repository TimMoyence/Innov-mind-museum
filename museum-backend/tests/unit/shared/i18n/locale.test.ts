import {
  resolveLocale,
  localeToLanguageName,
  parseAcceptLanguageHeader,
  isSupportedLocale,
  SUPPORTED_LOCALES,
} from '@shared/i18n/locale';

describe('locale utilities', () => {
  describe('SUPPORTED_LOCALES', () => {
    it('contains exactly 7 locales', () => {
      expect(SUPPORTED_LOCALES).toHaveLength(7);
      expect([...SUPPORTED_LOCALES]).toEqual(['en', 'fr', 'es', 'de', 'it', 'ja', 'zh']);
    });
  });

  describe('isSupportedLocale', () => {
    it.each(SUPPORTED_LOCALES)('returns true for "%s"', (locale) => {
      expect(isSupportedLocale(locale)).toBe(true);
    });

    it.each(['pt', 'ru', 'ko', 'ar', 'xx', ''])('returns false for "%s"', (locale) => {
      expect(isSupportedLocale(locale)).toBe(false);
    });
  });

  describe('resolveLocale', () => {
    it('returns "en" when candidates are empty', () => {
      expect(resolveLocale([])).toBe('en');
    });

    it('returns "en" when all candidates are undefined/null', () => {
      expect(resolveLocale([undefined, null, undefined])).toBe('en');
    });

    it('extracts language code from full locale tag', () => {
      expect(resolveLocale(['fr-FR'])).toBe('fr');
      expect(resolveLocale(['de-DE'])).toBe('de');
      expect(resolveLocale(['ja-JP'])).toBe('ja');
      expect(resolveLocale(['zh-CN'])).toBe('zh');
      expect(resolveLocale(['es-ES'])).toBe('es');
      expect(resolveLocale(['it-IT'])).toBe('it');
    });

    it('handles bare language codes', () => {
      expect(resolveLocale(['fr'])).toBe('fr');
      expect(resolveLocale(['de'])).toBe('de');
    });

    it('returns the first matching candidate', () => {
      expect(resolveLocale([undefined, 'fr-FR', 'de'])).toBe('fr');
      expect(resolveLocale([null, undefined, 'ja'])).toBe('ja');
    });

    it('falls back to "en" for unsupported locales', () => {
      expect(resolveLocale(['pt-BR'])).toBe('en');
      expect(resolveLocale(['ko'])).toBe('en');
    });

    it('is case-insensitive', () => {
      expect(resolveLocale(['FR-FR'])).toBe('fr');
      expect(resolveLocale(['ZH-CN'])).toBe('zh');
    });

    it('handles underscore separators', () => {
      expect(resolveLocale(['fr_FR'])).toBe('fr');
      expect(resolveLocale(['zh_CN'])).toBe('zh');
    });
  });

  describe('localeToLanguageName', () => {
    it.each([
      ['en', 'English'],
      ['fr', 'French'],
      ['es', 'Spanish'],
      ['de', 'German'],
      ['it', 'Italian'],
      ['ja', 'Japanese'],
      ['zh', 'Chinese'],
    ] as const)('maps "%s" to "%s"', (locale, expected) => {
      expect(localeToLanguageName(locale)).toBe(expected);
    });
  });

  describe('parseAcceptLanguageHeader', () => {
    it('returns undefined for empty/missing header', () => {
      expect(parseAcceptLanguageHeader()).toBeUndefined();
      expect(parseAcceptLanguageHeader('')).toBeUndefined();
    });

    it('extracts the first language tag', () => {
      expect(parseAcceptLanguageHeader('fr-FR')).toBe('fr-FR');
      expect(parseAcceptLanguageHeader('en-US,en;q=0.9')).toBe('en-US');
    });

    it('ignores quality values', () => {
      expect(parseAcceptLanguageHeader('de;q=0.8')).toBe('de');
    });

    it('handles complex Accept-Language headers', () => {
      expect(parseAcceptLanguageHeader('ja, en-US;q=0.9, fr;q=0.8')).toBe('ja');
    });

    it('trims whitespace', () => {
      expect(parseAcceptLanguageHeader('  es-ES , en;q=0.5  ')).toBe('es-ES');
    });

    it('returns undefined for header with only semicolons/commas', () => {
      // After splitting and filtering, no valid tag remains
      expect(parseAcceptLanguageHeader(';q=0.8, ;q=0.5')).toBeUndefined();
    });
  });
});
