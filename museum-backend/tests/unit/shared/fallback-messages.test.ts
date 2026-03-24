import { buildLocalizedFallback, FALLBACK_TEMPLATES } from '@shared/i18n/fallback-messages';
import type { SupportedLocale } from '@shared/i18n/locale';

describe('buildLocalizedFallback', () => {
  it('builds English fallback without location in museum mode', () => {
    const result = buildLocalizedFallback('en', {
      recap: 'The painting shows a starry night.',
      museumMode: true,
    });

    expect(result).toContain('Quick summary: The painting shows a starry night.');
    expect(result).toContain('Next step: compare composition details');
    expect(result).toContain('Would you like');
  });

  it('builds English fallback with location prefix', () => {
    const result = buildLocalizedFallback('en', {
      location: 'Room 12',
      recap: 'A marble sculpture.',
      museumMode: true,
    });

    expect(result).toContain('You are currently near Room 12.');
    expect(result).toContain('A marble sculpture.');
  });

  it('uses standardHint when museumMode is false', () => {
    const result = buildLocalizedFallback('en', {
      recap: 'Some recap.',
      museumMode: false,
    });

    expect(result).toContain('Helpful angle');
    expect(result).not.toContain('Next step');
  });

  it('works for all supported locales', () => {
    const locales: SupportedLocale[] = ['en', 'fr', 'es', 'de', 'it', 'ja', 'zh'];

    for (const locale of locales) {
      const result = buildLocalizedFallback(locale, {
        recap: 'test recap',
        museumMode: true,
      });

      expect(result.length).toBeGreaterThan(0);
      expect(result).toContain('test recap');
    }
  });

  it('builds French fallback with location', () => {
    const result = buildLocalizedFallback('fr', {
      location: 'Salle 5',
      recap: 'Un portrait.',
      museumMode: false,
    });

    expect(result).toContain('Vous êtes près de Salle 5.');
    expect(result).toContain('Piste utile');
  });

  it('all locales have locationPrefix as a function', () => {
    const locales: SupportedLocale[] = ['en', 'fr', 'es', 'de', 'it', 'ja', 'zh'];

    for (const locale of locales) {
      const templates = FALLBACK_TEMPLATES[locale];
      expect(typeof templates.locationPrefix).toBe('function');
      const prefix = templates.locationPrefix('Test Room');
      expect(prefix.length).toBeGreaterThan(0);
      expect(prefix).toContain('Test Room');
    }
  });
});
