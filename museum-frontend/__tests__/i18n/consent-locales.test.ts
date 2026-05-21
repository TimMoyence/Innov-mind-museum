/**
 * RED — i18n consent-locale completeness test for I-CMP2.
 *
 * Spec: R21, R22 + acceptance criterion C5
 *   (team-state/2026-05-21-p0-gdpr/spec.md §3.3, §9).
 * Tasks: T3.2 (RED), backed by T3.5 (GREEN — translations).
 *
 * Contract:
 *   For each of the 6 non-EN/FR mobile locales {de, es, it, ja, zh, ar},
 *   `museum-frontend/shared/locales/<loc>/translation.json` MUST contain
 *   exactly these 10 keys under the `consent` namespace, with locally-
 *   appropriate translations (NOT identical to the EN reference string —
 *   catches lazy copy-paste).
 *
 * Reference EN values: `shared/locales/en/translation.json` keys
 *   consent.summary_only_content (:1107)
 *   consent.summary_no_personal_data (:1108)
 *   consent.summary_processing (:1109)
 *   consent.summary_revoke_anytime (:1110)
 *   consent.accept_all (:1111)
 *   consent.manage_choices (:1112)
 *   consent.back_to_summary (:1113)
 *   consent.manage_title (:1114)
 *   consent.manage_subtitle (:1115)
 *   consent.save_required_hint (:1116)
 *
 * RED expectations (pre-impl, verified V3):
 *   Each of the 6 locales is currently missing ALL 10 keys.
 *   `consent_count = 30` (vs 40 for en/fr). The expect calls below all fail.
 *
 * Per `lib-docs/i18next/LESSONS.md` (F5): supportedLngs is a separate concern;
 * this test only asserts JSON file completeness — the runtime i18next instance
 * is not booted here.
 */

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
      // R21: key must be present.
      expect(consent).toHaveProperty(key);
      // R21: value must be a non-empty string.
      expect(typeof consent[key]).toBe('string');
      expect((consent[key] as string).trim().length).toBeGreaterThan(0);
    });

    it.each(REQUIRED_CONSENT_KEYS)(
      `consent.%s is not the EN string verbatim (C5 — no lazy copy-paste)`,
      (key) => {
        const enValue = enConsent[key] as string;
        const localeValue = consent[key];
        // If the key is missing, this assertion is moot — the previous test
        // catches it. Guard so the diagnostic stays clear.
        if (typeof localeValue !== 'string') {
          // Force a failing assertion that points at the missing key, not at
          // the equality comparison (UFR-013 — clear diagnostics).
          throw new Error(
            `consent.${key} is missing in ${locale} (cannot evaluate C5 distinctness)`,
          );
        }
        expect(localeValue).not.toBe(enValue);
      },
    );
  });
});
