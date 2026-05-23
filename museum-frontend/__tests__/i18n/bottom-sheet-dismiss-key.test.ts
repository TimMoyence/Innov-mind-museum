/**
 * Red test for i18n key `a11y.bottomSheet.dismiss` (D3).
 *
 * UFR-022 run `2026-05-23-chat-composer-buttons-modal-dismiss`.
 *
 * FAILS on current code (key absent in both FR + EN). PASSES once the green
 * phase adds it to both locale JSON files.
 *
 * i18next missing-key mode is `fallback` (`fallbackLng: 'en'`, no
 * `saveMissing`/`throw`) per `shared/i18n/i18n.ts`. We only add the key to
 * FR + EN this run; other 6 locales fall back via i18next.
 */

import frTranslations from '@/shared/locales/fr/translation.json';
import enTranslations from '@/shared/locales/en/translation.json';

interface A11yNamespace {
  bottomSheet?: {
    dismiss?: string;
  };
}

interface Translations {
  a11y?: A11yNamespace;
}

describe('i18n — a11y.bottomSheet.dismiss key (D3, R12)', () => {
  it('FR translation has a11y.bottomSheet.dismiss = "Fermer la feuille"', () => {
    const fr = frTranslations as Translations;
    expect(fr.a11y?.bottomSheet?.dismiss).toBe('Fermer la feuille');
  });

  it('EN translation has a11y.bottomSheet.dismiss = "Dismiss sheet"', () => {
    const en = enTranslations as Translations;
    expect(en.a11y?.bottomSheet?.dismiss).toBe('Dismiss sheet');
  });
});
