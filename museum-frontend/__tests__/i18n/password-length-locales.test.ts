import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import i18next from 'i18next';

const LOCALES = ['en', 'fr', 'de', 'es', 'it', 'ja', 'zh', 'ar'] as const;
const KEYS = ['change_password.error_short', 'reset_password.error_short'] as const;
const LOCALES_ROOT = join(__dirname, '..', '..', 'shared', 'locales');

function loadTranslation(locale: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(LOCALES_ROOT, locale, 'translation.json'), 'utf8')) as Record<
    string,
    unknown
  >;
}

describe('L3 · le message « mot de passe trop court » suit la borne partagée, dans chaque langue', () => {
  const instance = i18next.createInstance();

  beforeAll(async () => {
    await instance.init({
      resources: Object.fromEntries(
        LOCALES.map((locale) => [locale, { translation: loadTranslation(locale) }]),
      ),
      lng: 'en',
      interpolation: { escapeValue: false },
    });
  });

  for (const locale of LOCALES) {
    for (const key of KEYS) {
      it(`${locale} · ${key} affiche la borne qu’on lui donne`, () => {
        const message = instance.t(key, { lng: locale, min: 12 });

        expect(message).toContain('12');
        expect(message).not.toMatch(/\b8\b|{{/);
      });
    }

    if (locale !== 'en') {
      it(`${locale} · reset_password.error_short est traduit`, () => {
        expect(instance.t('reset_password.error_short', { lng: locale, min: 8 })).not.toBe(
          instance.t('reset_password.error_short', { lng: 'en', min: 8 }),
        );
      });
    }
  }
});
