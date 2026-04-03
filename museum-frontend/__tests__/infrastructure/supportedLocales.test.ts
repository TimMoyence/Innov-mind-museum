import {
  isSupportedLocale,
  toSupportedLocale,
  SUPPORTED_LOCALES,
  LANGUAGE_OPTIONS,
} from '@/shared/config/supportedLocales';

describe('isSupportedLocale', () => {
  it('returns true for all supported locales', () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(isSupportedLocale(locale)).toBe(true);
    }
  });

  it('returns false for unsupported locales', () => {
    expect(isSupportedLocale('xx')).toBe(false);
    expect(isSupportedLocale('ko')).toBe(false);
    expect(isSupportedLocale('')).toBe(false);
  });
});

describe('toSupportedLocale', () => {
  it('returns the locale for a bare supported code', () => {
    expect(toSupportedLocale('fr')).toBe('fr');
    expect(toSupportedLocale('en')).toBe('en');
    expect(toSupportedLocale('ja')).toBe('ja');
  });

  it('extracts locale from full tag (e.g. fr-FR)', () => {
    expect(toSupportedLocale('fr-FR')).toBe('fr');
    expect(toSupportedLocale('en-US')).toBe('en');
    expect(toSupportedLocale('de-AT')).toBe('de');
  });

  it('handles underscore separator', () => {
    expect(toSupportedLocale('zh_CN')).toBe('zh');
  });

  it('is case-insensitive', () => {
    expect(toSupportedLocale('FR')).toBe('fr');
    expect(toSupportedLocale('EN-US')).toBe('en');
  });

  it('returns en for unsupported locale', () => {
    expect(toSupportedLocale('xx')).toBe('en');
    expect(toSupportedLocale('ko-KR')).toBe('en');
  });
});

describe('LANGUAGE_OPTIONS', () => {
  it('has an option for each supported locale', () => {
    const codes = LANGUAGE_OPTIONS.map((opt) => opt.code);
    for (const locale of SUPPORTED_LOCALES) {
      expect(codes).toContain(locale);
    }
  });

  it('each option has code, label, and nativeLabel', () => {
    for (const opt of LANGUAGE_OPTIONS) {
      expect(opt.code).toBeDefined();
      expect(opt.label).toBeDefined();
      expect(opt.nativeLabel).toBeDefined();
    }
  });
});
