/**
 * Conformité email RGPD — RED phase (UFR-022, RUN_ID 2026-06-13-conformite-email-subprocessors).
 *
 * Materializes one failing assertion per use-case from the test-contract
 * (`.claude/skills/team/team-state/working/2026-06-13-conformite-email-subprocessors/test-contract.md`)
 * for every BE-owned surface + the cross-repo doc surfaces (docs/legal, docs/operations,
 * docs/privacy-policy.html) and the codegen template.
 *
 * OLD = `tim.moyence@gmail.com` (must be eliminated from the in-scope surfaces).
 * NEW = `contact@musaium.com` (target).
 *
 * Pre-impl state (RED): OLD is still present everywhere in scope → these tests FAIL.
 * They prove the absence of the conformity change. Tests only — no production fix here.
 *
 * Tiers:
 *  - unit        : read a static file (JSON / .ts / .md / .html) and assert on its bytes.
 *  - integration : execute a REAL binary against the REAL filesystem/git (never mocked) —
 *                  codegen-legal-content.mjs (UC-A19/A38) + privacy-content-drift.mjs (UC-A34).
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../../../');

const OLD = 'tim.moyence@gmail.com';
const NEW = 'contact@musaium.com';

// Case-insensitive OLD detector (UC-A35): email local+domain are case-insensitive,
// so a mis-cased residue is still a leak.
const OLD_CI = /tim\.moyence@gmail\.com/i;

// Near-miss NEW detector (UC-A36): quasi-NEW addresses that are dead mailboxes.
// NOTE: `contact@musaium.co` is intentionally NOT a substring entry here — it is
// a substring of the valid `contact@musaium.com`, so `.toContain` on it can never
// be false. The `.co`-without-trailing-`m` typo is checked separately below with a
// word-boundary regex (NEAR_MISS_CO_RE) so the valid `.com` is not flagged.
const NEAR_MISS_NEW = ['contact@mail.musaium.com', 'contact @musaium.com', 'contacts@musaium.com'];

// `contact@musaium.co` that is NOT immediately followed by `m` is a dead-mailbox
// typo; the valid `contact@musaium.com` is excluded by the negative lookahead.
const NEAR_MISS_CO_RE = /contact@musaium\.co(?![m])/;

const read = (rel: string): string => readFileSync(path.join(REPO_ROOT, rel), 'utf8');

const BE_PRIVACY = 'museum-backend/src/shared/legal/privacy-content.canonical.json';
const WEB_PRIVACY = 'museum-web/src/lib/legal/privacy-content.canonical.json';
const BE_TERMS = 'museum-backend/src/shared/legal/terms-content.canonical.json';
const WEB_TERMS = 'museum-web/src/lib/legal/terms-content.canonical.json';
const CODEGEN = 'museum-frontend/scripts/codegen-legal-content.mjs';
const FE_GENERATED = 'museum-frontend/features/legal/privacyPolicyContent.ts';
const PRIVACY_HTML = 'docs/privacy-policy.html';
const DPIA = 'docs/legal/DPIA.md';
const ROPA = 'docs/legal/ROPA.md';
const READINESS = 'docs/legal/DPIA_ROPA_READINESS.md';
const CNIL = 'docs/operations/CNIL_BREACH_NOTIFICATION_DRYRUN.md';

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

// ───────────────────────── A. Privacy canonical (BE) ─────────────────────────
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

// ───────────────── B. Privacy canonical (web) + INV-1 no-drift ────────────────
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

// ───────────────────── C. Terms canonical (BE + web) + INV-1 ──────────────────
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

// ───────────── D. Codegen template (script) — anti-drift source ──────────────
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

// ────────── D'. FE generated file static surface (UC-A16/A17) ─────────────────
// NOTE: read as text (not import) so the BE jest project does not depend on FE
// module resolution. The byte-exact contactEmail import assertion lives in the
// FE jest test (legalContent.test.ts, UC-A16/A17).
describe('UC-A16 / UC-A17 — FE generated privacyPolicyContent.ts (static bytes)', () => {
  const src = read(FE_GENERATED);

  it('UC-A17 (regression): generated file has 0 OLD', () => {
    expect(src).not.toContain(OLD);
  });

  it('UC-A16 (regression): generated contactEmail literal === NEW', () => {
    expect(src).toContain(`contactEmail: '${NEW}'`);
  });
});

// ─────────────────────── G. Published HTML (mailto/href) ─────────────────────
describe('UC-A26 / UC-A27 — docs/privacy-policy.html mailto + text', () => {
  const html = read(PRIVACY_HTML);

  it('UC-A26 (regression): 0 OLD in text OR mailto href', () => {
    expect(html).not.toContain(OLD);
    expect(html).not.toContain(`mailto:${OLD}`);
  });

  it('UC-A27 (edge): every mailto href points to NEW; 0 mailto to OLD', () => {
    const mailtos = html.match(/mailto:[^"'>\s]+/g) ?? [];
    expect(mailtos.length).toBeGreaterThan(0);
    for (const m of mailtos) {
      expect(m).toBe(`mailto:${NEW}`);
    }
    // The DISPLAYED text must also be NEW (a patched href with stale text = trap).
    expect(html).toContain(NEW);
  });
});

// ─────────────── H. Internal legal docs + DPO alias (EARS-A5) ─────────────────
describe('UC-A28..A30 — DPIA / ROPA / READINESS: 0 OLD + DPO alias -> NEW', () => {
  it('UC-A28 (regression): DPIA.md has 0 OLD; DPO alias forwards to NEW', () => {
    const md = read(DPIA);
    expect(md).not.toContain(OLD);
    expect(md).toContain('dpo@musaium.com');
    expect(md).toContain(NEW);
  });

  it('UC-A29 (regression): ROPA.md has 0 OLD; DPO alias forwards to NEW', () => {
    const md = read(ROPA);
    expect(md).not.toContain(OLD);
    expect(md).toContain('dpo@musaium.com');
    expect(md).toContain(NEW);
  });

  it('UC-A30 (regression): DPIA_ROPA_READINESS.md has 0 OLD; mailbox -> NEW', () => {
    const md = read(READINESS);
    expect(md).not.toContain(OLD);
    expect(md).toContain('dpo@musaium.com');
    expect(md).toContain(NEW);
  });
});

// ───────── UC-A39 (scope extension): CNIL breach dry-run DPO alias ────────────
describe('UC-A39 — CNIL_BREACH_NOTIFICATION_DRYRUN.md DPO alias -> NEW', () => {
  it('UC-A39 (regression): 0 OLD; dpo@ alias references NEW (not a personal mailbox)', () => {
    const md = read(CNIL);
    expect(md).not.toContain(OLD);
    expect(md).toContain('dpo@musaium.com');
    // The parenthetical must forward to the brand mailbox NEW, not "founder personal".
    expect(md).toContain(NEW);
  });
});

// ─────────────── I. Scope guard rails — exclusions stay intact ────────────────
describe('UC-A31 / UC-A33 — exclusions still contain OLD (account identity)', () => {
  it('UC-A31 (regression): played migration still has OLD (immutable identity key)', () => {
    const mig = read(
      'museum-backend/src/data/db/migrations/1778240010000-BackfillSuperAdminOwner.ts',
    );
    expect(mig).toContain(OLD);
    expect(mig).toContain(`WHERE "email" = '${OLD}'`);
  });

  it('UC-A33 (regression): ops super_admin refs still contain OLD', () => {
    expect(read('museum-backend/scripts/smoke-grafana-prod.sh')).toContain(OLD);
    expect(read('docs/CI_CD_SECRETS.md')).toContain(OLD);
    expect(read('docs/OPS_DEPLOYMENT.md')).toContain(OLD);
  });
});

// ── Invariant + adversarial form: case-insensitive / near-miss / comment ──────
describe('UC-A32 / UC-A35 / UC-A36 / UC-A37 — global invariant + adversarial forms', () => {
  // The in-scope inclusion list (UC-A32 explicitly EXCLUDES .next/, migration,
  // smoke-grafana-prod.sh, CI_CD_SECRETS.md, OPS_DEPLOYMENT.md).
  const INCLUDED = [
    BE_PRIVACY,
    WEB_PRIVACY,
    BE_TERMS,
    WEB_TERMS,
    CODEGEN,
    FE_GENERATED,
    'museum-frontend/features/legal/termsOfServiceContent.ts',
    'museum-web/src/app/[locale]/cookies/page.tsx',
    PRIVACY_HTML,
    DPIA,
    ROPA,
    READINESS,
    CNIL,
  ];

  it('UC-A32 (edge): invariant scope excludes the account-identity surfaces', () => {
    const EXCLUDED = [
      '.next/',
      '1778240010000-BackfillSuperAdminOwner.ts',
      'smoke-grafana-prod.sh',
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
      // Word-boundary `.co`-typo check: the valid `contact@musaium.com` must NOT
      // trip this (negative lookahead on the trailing `m`), but a truncated
      // `contact@musaium.co` (dead mailbox) must.
      expect(content).not.toMatch(NEAR_MISS_CO_RE);
    }
  });

  it('UC-A37 (edge): no OLD hidden inside comments either', () => {
    // A dead email hidden in a // ... or <!-- ... --> or JSDoc comment is still
    // a copy-paste risk and slips past comment-stripping sentinels. Plain
    // substring search over the raw bytes catches it regardless of position.
    for (const rel of INCLUDED) {
      expect(read(rel)).not.toContain(OLD);
    }
  });
});

// ─────────────── J. Integration tier — REAL binaries, never mocked ───────────
// HEAD-INDEPENDENT idempotence: we compare the generated bytes against THEMSELVES
// across codegen runs, never against `git HEAD` (HEAD may still carry pre-commit
// OLD state). Restore is an fs backup/restore of the exact pre-test bytes — NEVER
// `git checkout` (that would revert uncommitted NEW work in the tree back to OLD).
describe('UC-A19 / UC-A38 — codegen <-> FS (integration)', () => {
  const FE_GENERATED_ABS = path.join(REPO_ROOT, FE_GENERATED);

  const runCodegen = (): ReturnType<typeof spawnSync> =>
    spawnSync('node', [path.join(REPO_ROOT, CODEGEN)], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });

  it('UC-A19 (regression): codegen is a no-op against the in-tree file and carries NEW', () => {
    // Capture the exact pre-test bytes so finally can restore them verbatim.
    const before = readFileSync(FE_GENERATED_ABS, 'utf8');
    try {
      const gen = runCodegen();
      expect(gen.status).toBe(0);

      // Re-running codegen over a file that already matches its output is a no-op:
      // the freshly written bytes must be byte-identical to what was already there.
      const after = readFileSync(FE_GENERATED_ABS, 'utf8');
      expect(after).toBe(before);

      // The generated content MUST carry NEW and no OLD (real FS bytes).
      expect(after).not.toContain(OLD);
      expect(after).toContain(`contactEmail: '${NEW}'`);
    } finally {
      // Restore the exact pre-test bytes (fs, not git) — leave the tree untouched.
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

      // Two consecutive codegen runs produce byte-identical output (no drift).
      expect(secondOutput).toBe(firstOutput);
      expect(secondOutput).toContain(`contactEmail: '${NEW}'`);
    } finally {
      writeFileSync(FE_GENERATED_ABS, before, 'utf8');
    }
  });
});

// ─────────────── J'. Sentinel drift stays green (integration) ─────────────────
describe('UC-A34 — privacy-content-drift.mjs stays green after email change', () => {
  it('UC-A34 (regression): sentinel exits 0 against the real repo root', () => {
    const SENTINEL = path.join(
      REPO_ROOT,
      'museum-backend/scripts/sentinels/privacy-content-drift.mjs',
    );
    const res = spawnSync('node', [SENTINEL, '--root', REPO_ROOT], {
      encoding: 'utf8',
    });
    expect(res.status).toBe(0);
  });
});
