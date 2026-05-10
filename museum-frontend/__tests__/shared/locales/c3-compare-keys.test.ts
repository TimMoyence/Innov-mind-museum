/**
 * RED test for T8.6 — C3 compare i18n key parity (FR/EN).
 *
 * Asserts both `shared/locales/fr/translation.json` and
 * `shared/locales/en/translation.json` contain the new keys introduced
 * by Phase 8:
 *   - chat.compare.title
 *   - chat.compare.empty
 *   - chat.compare.viewArtist
 *   - chat.compare.attribution
 *   - chat.compare.rationale.fallback
 *
 * Also enforces parity: any C3-namespaced key (`chat.compare.*`) present
 * in one locale MUST exist in the other.
 *
 * Keys do NOT exist yet — the test must FAIL until T8.6 lands.
 */
import fs from 'fs';
import path from 'path';

const REPO_LOCALES = path.resolve(__dirname, '../../../shared/locales');

type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject;
interface JsonObject {
  [key: string]: JsonValue;
}

const loadLocale = (lang: 'fr' | 'en'): JsonObject => {
  const filePath = path.join(REPO_LOCALES, lang, 'translation.json');
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw) as JsonObject;
};

const flatten = (obj: JsonValue, prefix = ''): string[] => {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return prefix ? [prefix] : [];
  }
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    out.push(...flatten(v, full));
  }
  return out;
};

const REQUIRED_KEYS = [
  'chat.compare.title',
  'chat.compare.empty',
  'chat.compare.viewArtist',
  'chat.compare.attribution',
  'chat.compare.rationale.fallback',
] as const;

describe('C3 — chat.compare.* i18n keys (T8.6)', () => {
  const fr = loadLocale('fr');
  const en = loadLocale('en');
  const frKeys = new Set(flatten(fr));
  const enKeys = new Set(flatten(en));

  it.each(REQUIRED_KEYS)('FR locale defines %s', (key) => {
    expect(frKeys.has(key)).toBe(true);
  });

  it.each(REQUIRED_KEYS)('EN locale defines %s', (key) => {
    expect(enKeys.has(key)).toBe(true);
  });

  it('every chat.compare.* key in FR also exists in EN', () => {
    const frCompare = [...frKeys].filter((k) => k.startsWith('chat.compare.'));
    const missing = frCompare.filter((k) => !enKeys.has(k));
    expect(missing).toEqual([]);
  });

  it('every chat.compare.* key in EN also exists in FR', () => {
    const enCompare = [...enKeys].filter((k) => k.startsWith('chat.compare.'));
    const missing = enCompare.filter((k) => !frKeys.has(k));
    expect(missing).toEqual([]);
  });
});
