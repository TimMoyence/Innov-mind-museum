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
  // Cycle 1.5-FE (REQ-FE-1/3/4, T-I18N-1) — the coarse (city+country) geo level
  // needs its own copy in all 8 locales: a sheet label, a sheet hint, and a
  // Settings-card revoke-row label.
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

/**
 * Cycle 1.5-FE (REQ-FE-2, AC-3, T-I18N-2) — RGPD precision-drift lock.
 *
 * The BE Cycle 1.5 location-resolver emits the NEIGHBOURHOOD (`<suburb>, <city>`)
 * once `location_to_llm` is granted — strictly finer than the city. The full-level
 * hint copy MUST therefore describe the neighbourhood/area, NOT the city, otherwise
 * the consent no longer faithfully describes the processing (RGPD Art. 5(1)(a)
 * transparency + Art. 4(11) specific consent).
 *
 * This asserts on the literal i18n VALUE (read from the real JSON files, not the
 * raw-key i18n mock — the component layer cannot distinguish the wording because
 * `t` returns the key) so it is an intentional anti-regression verbatim lock on
 * the corrected copy.
 *
 * The lock requires the neighbourhood/quartier level to be NAMED (the actual
 * correction). It deliberately does NOT forbid the city from appearing as a
 * parenthetical context (the GREEN copy in design §3.2 is "neighbourhood
 * (district + city)" / "quartier (quartier + ville)") — the drift was that the
 * shared level was DESCRIBED AS the city, not that the word city is present.
 * Today the hint reads "approximate area (city)" / "zone approximative (ville)"
 * and never names a neighbourhood/quartier → FAILS.
 */
describe('REQ-FE-2 — location_to_llm (full) hint describes neighbourhood, not city', () => {
  it('[en] scope_location_hint names the neighbourhood/district/area level', () => {
    const hint = getByPath(loadLocale('en'), 'consent.scope_location_hint');
    expect(typeof hint).toBe('string');
    const value = (hint as string).toLowerCase();
    expect(value).toMatch(/neighbourhood|neighborhood|district/);
    // The drift wording — "approximate area (city)" with city as THE shared
    // level and no finer term — must be gone.
    expect(value).not.toMatch(/approximate area \(city\)/);
  });

  it('[fr] scope_location_hint names the "quartier" level', () => {
    const hint = getByPath(loadLocale('fr'), 'consent.scope_location_hint');
    expect(typeof hint).toBe('string');
    const value = hint as string;
    expect(value).toMatch(/quartier/i);
    // The drift wording — "zone approximative (ville)" with city as THE shared
    // level — must be gone.
    expect(value).not.toMatch(/zone approximative \(ville\)/i);
  });
});
