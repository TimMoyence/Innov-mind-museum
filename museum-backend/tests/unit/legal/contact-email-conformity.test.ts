import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../../../');

const OLD = 'tim.moyence@gmail.com';
const NEW = 'contact@musaium.com';

const OLD_CI = /tim\.moyence@gmail\.com/i;

const NEAR_MISS_NEW = ['contact@mail.musaium.com', 'contact @musaium.com', 'contacts@musaium.com'];

const NEAR_MISS_CO_RE = /contact@musaium\.co(?![m])/;

const read = (rel: string): string => readFileSync(path.join(REPO_ROOT, rel), 'utf8');

const BE_PRIVACY = 'museum-backend/src/shared/legal/privacy-content.canonical.json';
const WEB_PRIVACY = 'museum-web/src/lib/legal/privacy-content.canonical.json';
const BE_TERMS = 'museum-backend/src/shared/legal/terms-content.canonical.json';
const WEB_TERMS = 'museum-web/src/lib/legal/terms-content.canonical.json';
const CODEGEN = 'museum-frontend/scripts/codegen-legal-content.mjs';
const FE_GENERATED = 'museum-frontend/features/legal/privacyPolicyContent.ts';

interface CanonicalPrivacy {
  locales: {
    en: { sections: { id: string; paragraphs: string[] }[] };
    fr: { sections: { id: string; paragraphs: string[] }[] };
  };
}
interface CanonicalTerms {
  locales: {
    en: { sections: { id: string; paragraphs: string[] }[] };
    fr: { sections: { id: string; paragraphs: string[] }[] };
  };
}

const sectionParagraphs = (
  doc: CanonicalPrivacy | CanonicalTerms,
  locale: 'en' | 'fr',
  id: string,
): string[] => {
  const s = doc.locales[locale].sections.find((x) => x.id === id);
  if (!s) throw new Error(`section ${id} (${locale}) not found`);
  return s.paragraphs;
};

describe('UC-A01..A07 — BE privacy canonical', () => {
  const raw = read(BE_PRIVACY);
  const doc = JSON.parse(raw) as CanonicalPrivacy;

  it('UC-A01 (regression): 0 occurrence of OLD anywhere', () => {
    expect(raw).not.toContain(OLD);
  });

  it('UC-A02 (happy): EN controller Contact paragraph === NEW exact', () => {
    expect(sectionParagraphs(doc, 'en', 'controller')).toContain(`Contact: ${NEW}.`);
  });

  it('UC-A03 (happy): EN rights paragraph contains NEW, not OLD', () => {
    const p = sectionParagraphs(doc, 'en', 'rights').join('\n');
    expect(p).toContain(NEW);
    expect(p).not.toContain(OLD);
  });

  it('UC-A04 (happy): EN minors paragraph contains NEW, not OLD', () => {
    const p = sectionParagraphs(doc, 'en', 'minors').join('\n');
    expect(p).toContain(NEW);
    expect(p).not.toContain(OLD);
  });

  it('UC-A05 (happy, FR): FR controller Contact paragraph === NEW exact (FR form)', () => {
    expect(sectionParagraphs(doc, 'fr', 'controller')).toContain(`Contact : ${NEW}.`);
  });

  it('UC-A06 (happy, FR): FR rights + minors contain NEW, not OLD', () => {
    const rights = sectionParagraphs(doc, 'fr', 'rights').join('\n');
    const minors = sectionParagraphs(doc, 'fr', 'minors').join('\n');
    expect(rights).toContain(NEW);
    expect(rights).not.toContain(OLD);
    expect(minors).toContain(NEW);
    expect(minors).not.toContain(OLD);
  });

  it('UC-A07 (edge, i18n parity): EN >= 3 and FR >= 3 NEW occurrences', () => {
    const enCount = (
      JSON.stringify(doc.locales.en).match(new RegExp(NEW.replace('.', '\\.'), 'g')) ?? []
    ).length;
    const frCount = (
      JSON.stringify(doc.locales.fr).match(new RegExp(NEW.replace('.', '\\.'), 'g')) ?? []
    ).length;
    expect(enCount).toBeGreaterThanOrEqual(3);
    expect(frCount).toBeGreaterThanOrEqual(3);
  });
});

describe('UC-A08..A10 — web privacy canonical + BE/web parity', () => {
  it('UC-A08 (regression): web privacy canonical has 0 OLD', () => {
    expect(read(WEB_PRIVACY)).not.toContain(OLD);
  });

  it('UC-A09 (happy): all 6 web privacy email paragraphs = NEW, no OLD', () => {
    const doc = JSON.parse(read(WEB_PRIVACY)) as CanonicalPrivacy;
    for (const loc of ['en', 'fr'] as const) {
      for (const id of ['controller', 'rights', 'minors']) {
        const p = sectionParagraphs(doc, loc, id).join('\n');
        expect(p).toContain(NEW);
        expect(p).not.toContain(OLD);
      }
    }
  });

  it('UC-A10 (regression, INV-1): BE and web privacy JSON are deep-equal', () => {
    expect(JSON.parse(read(WEB_PRIVACY))).toEqual(JSON.parse(read(BE_PRIVACY)));
  });
});

describe('UC-A11..A15 — terms canonical', () => {
  it('UC-A11 (regression): BE terms canonical has 0 OLD', () => {
    expect(read(BE_TERMS)).not.toContain(OLD);
  });

  it('UC-A12 (happy): BE terms EN contact paragraph[0] === NEW exact', () => {
    const doc = JSON.parse(read(BE_TERMS)) as CanonicalTerms;
    expect(sectionParagraphs(doc, 'en', 'contact')[0]).toBe(
      `For questions about these terms, contact: ${NEW}.`,
    );
  });

  it('UC-A13 (happy, FR): BE terms FR contact paragraph[0] === NEW exact (FR form)', () => {
    const doc = JSON.parse(read(BE_TERMS)) as CanonicalTerms;
    expect(sectionParagraphs(doc, 'fr', 'contact')[0]).toBe(
      `Pour toute question relative à ces conditions, contactez : ${NEW}.`,
    );
  });

  it('UC-A14 (regression): web terms has 0 OLD; EN+FR contact = NEW exact', () => {
    const raw = read(WEB_TERMS);
    expect(raw).not.toContain(OLD);
    const doc = JSON.parse(raw) as CanonicalTerms;
    expect(sectionParagraphs(doc, 'en', 'contact')[0]).toBe(
      `For questions about these terms, contact: ${NEW}.`,
    );
    expect(sectionParagraphs(doc, 'fr', 'contact')[0]).toBe(
      `Pour toute question relative à ces conditions, contactez : ${NEW}.`,
    );
  });

  it('UC-A15 (regression, INV-1): BE and web terms JSON are deep-equal', () => {
    expect(JSON.parse(read(WEB_TERMS))).toEqual(JSON.parse(read(BE_TERMS)));
  });
});

describe('UC-A18 / UC-A20 — codegen template hardcodes NEW (not OLD)', () => {
  const src = read(CODEGEN);

  it('UC-A18 (regression): script source has 0 OLD (else regen reintroduces it)', () => {
    expect(src).not.toContain(OLD);
  });

  it('UC-A20 (edge, INV-5): contactEmail literal in template === NEW', () => {
    expect(src).toContain(`contactEmail: '${NEW}'`);
    expect(src).not.toContain(`contactEmail: '${OLD}'`);
  });
});

describe('UC-A16 / UC-A17 — FE generated privacyPolicyContent.ts (static bytes)', () => {
  const src = read(FE_GENERATED);

  it('UC-A17 (regression): generated file has 0 OLD', () => {
    expect(src).not.toContain(OLD);
  });

  it('UC-A16 (regression): generated contactEmail literal === NEW', () => {
    expect(src).toContain(`contactEmail: '${NEW}'`);
  });
});

describe('UC-A31 / UC-A33 — exclusions still contain OLD (account identity)', () => {
  it('UC-A31 (regression): played migration still has OLD (immutable identity key)', () => {
    const mig = read(
      'museum-backend/src/data/db/migrations/1778240010000-BackfillSuperAdminOwner.ts',
    );
    expect(mig).toContain(OLD);
    expect(mig).toContain(`WHERE "email" = '${OLD}'`);
  });
});

describe('UC-A32 / UC-A35 / UC-A36 / UC-A37 — global invariant + adversarial forms', () => {
  const INCLUDED = [
    BE_PRIVACY,
    WEB_PRIVACY,
    BE_TERMS,
    WEB_TERMS,
    CODEGEN,
    FE_GENERATED,
    'museum-frontend/features/legal/termsOfServiceContent.ts',
    'museum-web/src/app/[locale]/cookies/page.tsx',
  ];

  it('UC-A32 (edge): invariant scope excludes the account-identity surfaces', () => {
    const EXCLUDED = [
      '.next/',
      '1778240010000-BackfillSuperAdminOwner.ts',
      'CI_CD_SECRETS.md',
      'OPS_DEPLOYMENT.md',
    ];
    for (const inc of INCLUDED) {
      for (const exc of EXCLUDED) {
        expect(inc).not.toContain(exc);
      }
    }
  });

  it('UC-A35 (edge): no case-insensitive OLD residue in any in-scope file', () => {
    for (const rel of INCLUDED) {
      expect(read(rel)).not.toMatch(OLD_CI);
    }
  });

  it('UC-A36 (edge): no near-miss NEW (typo/subdomain) in any in-scope file', () => {
    for (const rel of INCLUDED) {
      const content = read(rel);
      for (const nm of NEAR_MISS_NEW) {
        expect(content).not.toContain(nm);
      }
      expect(content).not.toMatch(NEAR_MISS_CO_RE);
    }
  });

  it('UC-A37 (edge): no OLD hidden inside comments either', () => {
    for (const rel of INCLUDED) {
      expect(read(rel)).not.toContain(OLD);
    }
  });
});

describe('UC-A19 / UC-A38 — codegen <-> FS (integration)', () => {
  const FE_GENERATED_ABS = path.join(REPO_ROOT, FE_GENERATED);

  const runCodegen = (): ReturnType<typeof spawnSync> =>
    spawnSync('node', [path.join(REPO_ROOT, CODEGEN)], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });

  it('UC-A19 (regression): codegen is a no-op against the in-tree file and carries NEW', () => {
    const before = readFileSync(FE_GENERATED_ABS, 'utf8');
    try {
      const gen = runCodegen();
      expect(gen.status).toBe(0);

      const after = readFileSync(FE_GENERATED_ABS, 'utf8');
      expect(after).toBe(before);

      expect(after).not.toContain(OLD);
      expect(after).toContain(`contactEmail: '${NEW}'`);
    } finally {
      writeFileSync(FE_GENERATED_ABS, before, 'utf8');
    }
  });

  it('UC-A38 (edge): codegen is idempotent — two consecutive runs are byte-identical', () => {
    const before = readFileSync(FE_GENERATED_ABS, 'utf8');
    try {
      expect(runCodegen().status).toBe(0);
      const firstOutput = readFileSync(FE_GENERATED_ABS, 'utf8');

      expect(runCodegen().status).toBe(0);
      const secondOutput = readFileSync(FE_GENERATED_ABS, 'utf8');

      expect(secondOutput).toBe(firstOutput);
      expect(secondOutput).toContain(`contactEmail: '${NEW}'`);
    } finally {
      writeFileSync(FE_GENERATED_ABS, before, 'utf8');
    }
  });
});
