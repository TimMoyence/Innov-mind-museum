import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const LOCALES_ROOT = join(__dirname, '..', '..', 'shared', 'locales');

const TARGET_LOCALES = ['de', 'es', 'it', 'ja', 'zh', 'ar'] as const;

const REQUIRED_CONSENT_KEYS = [
  'summary_only_content',
  'summary_no_personal_data',
  'summary_processing',
  'summary_revoke_anytime',
  'accept_all',
  'manage_choices',
  'back_to_summary',
  'manage_title',
  'manage_subtitle',
  'save_required_hint',
] as const;

interface TranslationFile {
  consent?: Record<string, unknown>;
  [key: string]: unknown;
}

function loadLocale(locale: string): TranslationFile {
  const raw = readFileSync(join(LOCALES_ROOT, locale, 'translation.json'), 'utf-8');
  return JSON.parse(raw) as TranslationFile;
}

const enTranslations = loadLocale('en');
const enConsent = enTranslations.consent ?? {};

describe('i18n: consent.* keys present in all non-EN/FR locales (R21, R22, C5)', () => {
  it('precondition: EN reference exposes all 10 consent.* keys (sanity check)', () => {
    for (const key of REQUIRED_CONSENT_KEYS) {
      expect(typeof enConsent[key]).toBe('string');
      expect((enConsent[key] as string).length).toBeGreaterThan(0);
    }
  });

  describe.each(TARGET_LOCALES)('locale %s', (locale) => {
    const translations = loadLocale(locale);
    const consent = translations.consent ?? {};

    it.each(REQUIRED_CONSENT_KEYS)(`declares consent.%s`, (key) => {
      expect(consent).toHaveProperty(key);
      expect(typeof consent[key]).toBe('string');
      expect((consent[key] as string).trim().length).toBeGreaterThan(0);
    });

    it.each(REQUIRED_CONSENT_KEYS)(
      `consent.%s is not the EN string verbatim (C5 — no lazy copy-paste)`,
      (key) => {
        const enValue = enConsent[key] as string;
        const localeValue = consent[key];
        if (typeof localeValue !== 'string') {
          throw new Error(
            `consent.${key} is missing in ${locale} (cannot evaluate C5 distinctness)`,
          );
        }
        expect(localeValue).not.toBe(enValue);
      },
    );
  });
});
