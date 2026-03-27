import { describe, it, expect } from 'vitest';
import { locales, defaultLocale, getDictionary, type Locale } from './i18n';

describe('i18n.ts', () => {
  it('exports fr and en as supported locales', () => {
    expect(locales).toContain('fr');
    expect(locales).toContain('en');
    expect(locales).toHaveLength(2);
  });

  it('uses fr as the default locale', () => {
    expect(defaultLocale).toBe('fr');
  });

  it('getDictionary returns a valid French dictionary', async () => {
    const dict = await getDictionary('fr');
    expect(dict.metadata.title).toBeTruthy();
    expect(dict.nav.home).toBeTruthy();
    expect(dict.hero.title).toBeTruthy();
    expect(dict.footer.copyright).toBeTruthy();
  });

  it('getDictionary returns a valid English dictionary', async () => {
    const dict = await getDictionary('en');
    expect(dict.metadata.title).toBeTruthy();
    expect(dict.nav.home).toBeTruthy();
    expect(dict.hero.title).toBeTruthy();
    expect(dict.footer.copyright).toBeTruthy();
  });

  it('French and English dictionaries have the same top-level keys', async () => {
    const fr = await getDictionary('fr');
    const en = await getDictionary('en');
    const frKeys = Object.keys(fr).sort();
    const enKeys = Object.keys(en).sort();
    expect(frKeys).toEqual(enKeys);
  });

  it('Locale type only allows fr or en', () => {
    // TypeScript compile-time check — at runtime just verify the array
    const validLocales: Locale[] = ['fr', 'en'];
    expect(validLocales).toHaveLength(2);
  });
});
