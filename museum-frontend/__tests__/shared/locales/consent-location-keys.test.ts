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
  'consent.scope_location_coarse',
  'consent.scope_location_coarse_hint',
  'settings.ai_consent_scope.location_coarse_to_llm',
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

describe('REQ-FE-2 — location_to_llm (full) hint describes neighbourhood, not city', () => {
  it('[en] scope_location_hint names the neighbourhood/district/area level', () => {
    const hint = getByPath(loadLocale('en'), 'consent.scope_location_hint');
    expect(typeof hint).toBe('string');
    const value = (hint as string).toLowerCase();
    expect(value).toMatch(/neighbourhood|neighborhood|district/);
    expect(value).not.toMatch(/approximate area \(city\)/);
  });

  it('[fr] scope_location_hint names the "quartier" level', () => {
    const hint = getByPath(loadLocale('fr'), 'consent.scope_location_hint');
    expect(typeof hint).toBe('string');
    const value = hint as string;
    expect(value).toMatch(/quartier/i);
    expect(value).not.toMatch(/zone approximative \(ville\)/i);
  });
});
