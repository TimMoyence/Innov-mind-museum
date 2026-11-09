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
