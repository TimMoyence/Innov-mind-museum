import { GUARDRAIL_REFUSALS } from '@shared/i18n/guardrail-refusals';
import { SUPPORTED_LOCALES } from '@shared/i18n/locale';

describe('guardrail refusals', () => {
  it('has entries for all 7 supported locales', () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(typeof GUARDRAIL_REFUSALS[locale]).toBe('object');
      expect(GUARDRAIL_REFUSALS[locale]).not.toBeNull();
    }
  });

  it.each(SUPPORTED_LOCALES)(
    'locale "%s" has non-empty insult, external_request, and default',
    (locale) => {
      const messages = GUARDRAIL_REFUSALS[locale];
      expect(typeof messages.insult).toBe('string');
      expect(messages.insult.length).toBeGreaterThan(10);
      expect(typeof messages.external_request).toBe('string');
      expect(messages.external_request.length).toBeGreaterThan(10);
      expect(typeof messages.default).toBe('string');
      expect(messages.default.length).toBeGreaterThan(10);
    },
  );

  it('produces 21 total refusal strings (7 locales x 3 variants)', () => {
    const variants: (keyof (typeof GUARDRAIL_REFUSALS)['en'])[] = [
      'insult',
      'external_request',
      'default',
    ];
    let count = 0;
    for (const locale of SUPPORTED_LOCALES) {
      for (const variant of variants) {
        expect(typeof GUARDRAIL_REFUSALS[locale][variant]).toBe('string');
        count++;
      }
    }
    expect(count).toBe(21);
  });

  it('en refusals mention art/museum/heritage', () => {
    const en = GUARDRAIL_REFUSALS.en;
    expect(en.insult.toLowerCase()).toContain('art');
    expect(en.default.toLowerCase()).toContain('art');
  });

  it('fr refusals are in French', () => {
    const fr = GUARDRAIL_REFUSALS.fr;
    expect(fr.insult).toContain('insultes');
    expect(fr.default).toContain('réponds uniquement');
  });

  it('all locales have distinct default messages', () => {
    const defaults = SUPPORTED_LOCALES.map((l) => GUARDRAIL_REFUSALS[l].default);
    const unique = new Set(defaults);
    expect(unique.size).toBe(SUPPORTED_LOCALES.length);
  });
});
