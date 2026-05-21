/**
 * T2.3 / R11 / R14 — Canonical content shape (RED phase, UFR-022).
 *
 * Asserts that the new canonical JSON file
 * `museum-backend/src/shared/legal/privacy-content.canonical.json` exists and
 * has the structure mandated by design.md §4 `PrivacyCanonical`:
 *
 *   {
 *     version: string,                // '1.0.0'
 *     lastUpdated: string,            // '2026-05-21'
 *     locales: {
 *       en: { sections: PrivacySection[14], recipients: Subprocessor[19] },
 *       fr: { sections: PrivacySection[14], recipients: Subprocessor[19] },
 *     }
 *   }
 *
 * Pre-impl state (RED): file does not exist → readFileSync throws ENOENT.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { CANONICAL_VENDORS } from '../../helpers/legal/vendors.fixtures';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const PRIVACY_CANONICAL = path.join(
  REPO_ROOT,
  'museum-backend/src/shared/legal/privacy-content.canonical.json',
);
const TERMS_CANONICAL = path.join(
  REPO_ROOT,
  'museum-backend/src/shared/legal/terms-content.canonical.json',
);

interface Subprocessor {
  name: string;
  role: string;
  jurisdiction: string;
  transferMechanism: 'SCC' | 'adequacy' | 'none' | 'internal';
  category: string;
}

interface PrivacySection {
  id: string;
  title: string;
  paragraphs: string[];
}

interface PrivacyCanonical {
  version: string;
  lastUpdated: string;
  locales: {
    en: { sections: PrivacySection[]; recipients: Subprocessor[] };
    fr: { sections: PrivacySection[]; recipients: Subprocessor[] };
  };
}

function loadCanonical<T>(file: string): T {
  const raw = readFileSync(file, 'utf8');
  return JSON.parse(raw) as T;
}

describe('T2.3 / R14 — privacy-content.canonical.json shape', () => {
  it('file exists and is valid JSON', () => {
    expect(() => loadCanonical<PrivacyCanonical>(PRIVACY_CANONICAL)).not.toThrow();
  });

  it('has version "1.0.0"', () => {
    const data = loadCanonical<PrivacyCanonical>(PRIVACY_CANONICAL);
    expect(data.version).toBe('1.0.0');
  });

  it('has lastUpdated "2026-05-21"', () => {
    const data = loadCanonical<PrivacyCanonical>(PRIVACY_CANONICAL);
    expect(data.lastUpdated).toBe('2026-05-21');
  });

  it.each(['en', 'fr'] as const)('locale %s has exactly 14 sections', (locale) => {
    const data = loadCanonical<PrivacyCanonical>(PRIVACY_CANONICAL);
    expect(data.locales[locale].sections).toHaveLength(14);
  });

  it.each(['en', 'fr'] as const)('locale %s has exactly 19 recipients (R11)', (locale) => {
    const data = loadCanonical<PrivacyCanonical>(PRIVACY_CANONICAL);
    expect(data.locales[locale].recipients).toHaveLength(19);
  });

  it.each(['en', 'fr'] as const)(
    'locale %s recipients carry required fields (name, role, jurisdiction, transferMechanism, category)',
    (locale) => {
      const data = loadCanonical<PrivacyCanonical>(PRIVACY_CANONICAL);
      for (const recipient of data.locales[locale].recipients) {
        expect(recipient.name).toEqual(expect.any(String));
        expect(recipient.role).toEqual(expect.any(String));
        expect(recipient.jurisdiction).toEqual(expect.any(String));
        expect(['SCC', 'adequacy', 'none', 'internal']).toContain(recipient.transferMechanism);
        expect(recipient.category).toEqual(expect.any(String));
      }
    },
  );

  it.each(['en', 'fr'] as const)(
    'locale %s recipients include every vendor from the R11 list',
    (locale) => {
      const data = loadCanonical<PrivacyCanonical>(PRIVACY_CANONICAL);
      const declared = new Set(data.locales[locale].recipients.map((r) => r.name.toLowerCase()));
      for (const vendor of CANONICAL_VENDORS) {
        // The canonical MUST contain a recipient whose name matches one of
        // the vendor aliases (case-insensitive).
        const found = vendor.searchAliases.some((alias) => declared.has(alias.toLowerCase()));
        expect({ vendor: vendor.name, found }).toEqual({
          vendor: vendor.name,
          found: true,
        });
      }
    },
  );

  it('Article 10 (EN) text cites "15" years and CNIL Délibération 2021-018', () => {
    const data = loadCanonical<PrivacyCanonical>(PRIVACY_CANONICAL);
    const article10 = data.locales.en.sections[9];
    expect(article10).toBeDefined();
    const joined = article10!.paragraphs.join('\n');
    // EN may render "15 years"; the legal citation must be verbatim.
    expect(joined).toMatch(/15\s+years?/i);
    expect(joined).toMatch(/D[ée]lib[ée]ration\s*2021-018/);
  });

  it('Article 10 (FR) text says "15 ans" and cites CNIL Délibération 2021-018', () => {
    const data = loadCanonical<PrivacyCanonical>(PRIVACY_CANONICAL);
    const article10 = data.locales.fr.sections[9];
    expect(article10).toBeDefined();
    const joined = article10!.paragraphs.join('\n');
    expect(joined).toMatch(/15\s+ans/);
    expect(joined).not.toMatch(/16\s+ans/);
    expect(joined).toMatch(/D[ée]lib[ée]ration\s*2021-018/);
  });
});

describe('T2.3 / R16 — terms-content.canonical.json shape', () => {
  it('file exists and is valid JSON', () => {
    expect(() => loadCanonical<unknown>(TERMS_CANONICAL)).not.toThrow();
  });

  it('has version "1.0.0" and lastUpdated "2026-05-21"', () => {
    const data = loadCanonical<{ version: string; lastUpdated: string }>(TERMS_CANONICAL);
    expect(data.version).toBe('1.0.0');
    expect(data.lastUpdated).toBe('2026-05-21');
  });

  it('exposes en + fr locale keys', () => {
    const data = loadCanonical<{ locales: Record<string, unknown> }>(TERMS_CANONICAL);
    expect(Object.keys(data.locales).sort()).toEqual(['en', 'fr']);
  });
});
