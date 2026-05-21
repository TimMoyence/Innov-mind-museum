/**
 * RED test for B9 i18n (spec R4 / AC-B9-4, tasks T2.1).
 *
 * The `location_to_llm` consent surface introduces new copy that MUST exist,
 * non-empty, in ALL 8 supported locales (en, fr, es, de, it, ja, zh, ar —
 * verified from `shared/i18n/i18n.ts`). Keys:
 *   - consent.scope_location          (toggle label, manage view)
 *   - consent.scope_location_hint     (toggle hint: coarse city shared, precise never)
 *   - settings.ai_consent_scope.location_to_llm  (Settings revoke-row label)
 *
 * Keys do NOT exist yet — this test FAILS until T2.2 lands them in all 8 files.
 * `ar` is RTL ; the green phase must author a faithful Arabic translation
 * (no English placeholder).
 */
import fs from 'fs';
import path from 'path';

const REPO_LOCALES = path.resolve(__dirname, '../../../shared/locales');

const LOCALES = ['en', 'fr', 'es', 'de', 'it', 'ja', 'zh', 'ar'] as const;
type Locale = (typeof LOCALES)[number];

type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject;
interface JsonObject {
  [key: string]: JsonValue;
}

const loadLocale = (lang: Locale): JsonObject => {
  const filePath = path.join(REPO_LOCALES, lang, 'translation.json');
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw) as JsonObject;
};

const getByPath = (obj: JsonObject, dottedKey: string): JsonValue | undefined => {
  let cursor: JsonValue | undefined = obj;
  for (const segment of dottedKey.split('.')) {
    if (cursor === null || typeof cursor !== 'object' || Array.isArray(cursor)) return undefined;
    cursor = cursor[segment];
  }
  return cursor;
};

const REQUIRED_KEYS = [
  'consent.scope_location',
  'consent.scope_location_hint',
  'settings.ai_consent_scope.location_to_llm',
] as const;

describe('B9 — location_to_llm consent copy present in all 8 locales', () => {
  for (const locale of LOCALES) {
    const dict = loadLocale(locale);
    for (const key of REQUIRED_KEYS) {
      it(`[${locale}] has a non-empty "${key}"`, () => {
        const value = getByPath(dict, key);
        expect(typeof value).toBe('string');
        expect((value as string).trim().length).toBeGreaterThan(0);
      });
    }
  }
});
