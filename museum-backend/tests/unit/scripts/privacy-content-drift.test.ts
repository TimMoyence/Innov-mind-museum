/**
 * T2.2 / R15 — privacy-content-drift sentinel (RED phase, UFR-022).
 *
 * The sentinel `museum-backend/scripts/sentinels/privacy-content-drift.mjs`
 * compares the 3 public privacy surfaces (HTML / museum-web / museum-frontend)
 * against the canonical JSON source. It must:
 *   (positive) exit 0 when canonical ↔ HTML ↔ web ↔ FE are in sync, AND
 *   (negative-1) exit ≠ 0 + name "HTML" when HTML `lastUpdated` mutates;
 *   (negative-2) exit ≠ 0 + name "museum-frontend" + the dropped vendor when
 *     a vendor is removed from the FE recipients list;
 *   (negative-3) exit ≠ 0 + name "museum-web" when web section IDs mutate.
 *
 * The sentinel is invoked under tmpdir fixtures (no repo mutation). Pre-impl
 * state (RED): script does not exist → spawn returns ENOENT non-zero exit.
 * The "positive" subtest will also fail because the canonical JSON doesn't
 * exist yet either.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const SENTINEL = path.join(REPO_ROOT, 'museum-backend/scripts/sentinels/privacy-content-drift.mjs');

interface CanonicalFixture {
  version: string;
  lastUpdated: string;
  locales: {
    en: {
      sections: Array<{ id: string; title: string; paragraphs: string[] }>;
      recipients: Array<{ name: string }>;
    };
    fr: {
      sections: Array<{ id: string; title: string; paragraphs: string[] }>;
      recipients: Array<{ name: string }>;
    };
  };
}

/**
 * Build a minimal but valid canonical/HTML/web/FE fixture set under
 * `fixturesDir`. All four surfaces start byte-aligned.
 *
 * The fixture layout intentionally mirrors the production paths so the
 * sentinel can resolve them via a `--root <fixturesDir>` flag (see GREEN
 * implementation contract in design.md §6 + tasks.md T2.6).
 */
function buildSyncedFixtures(root: string): void {
  // Canonical
  mkdirSync(path.join(root, 'museum-backend/src/shared/legal'), { recursive: true });
  const canonical: CanonicalFixture = {
    version: '1.0.0',
    lastUpdated: '2026-05-21',
    locales: {
      en: {
        sections: [
          { id: 'controller', title: '1', paragraphs: ['Controller is InnovMind.'] },
          {
            id: 'recipients',
            title: '5',
            paragraphs: ['Sub-processors: OpenAI; DeepSeek; Brevo.'],
          },
          { id: 'minors', title: '10', paragraphs: ['15 years per CNIL Délibération 2021-018.'] },
        ],
        recipients: [{ name: 'OpenAI' }, { name: 'DeepSeek' }, { name: 'Brevo' }],
      },
      fr: {
        sections: [
          { id: 'controller', title: '1', paragraphs: ['Le responsable est InnovMind.'] },
          {
            id: 'recipients',
            title: '5',
            paragraphs: ['Sous-traitants : OpenAI ; DeepSeek ; Brevo.'],
          },
          { id: 'minors', title: '10', paragraphs: ['15 ans selon CNIL Délibération 2021-018.'] },
        ],
        recipients: [{ name: 'OpenAI' }, { name: 'DeepSeek' }, { name: 'Brevo' }],
      },
    },
  };
  writeFileSync(
    path.join(root, 'museum-backend/src/shared/legal/privacy-content.canonical.json'),
    JSON.stringify(canonical, null, 2),
    'utf8',
  );

  // HTML (FR-rendered; the "15 ans" line is the critical R13 marker)
  mkdirSync(path.join(root, 'docs'), { recursive: true });
  const html = [
    '<!-- GENERATED -->',
    '<html><body>',
    '<meta name="version" content="1.0.0">',
    '<meta name="last-updated" content="2026-05-21">',
    '<section id="controller"><h2>1</h2><p>Le responsable est InnovMind.</p></section>',
    '<section id="recipients"><h2>5</h2><p>Sous-traitants : OpenAI ; DeepSeek ; Brevo.</p></section>',
    '<section id="minors"><h2>10</h2><p>15 ans selon CNIL Délibération 2021-018.</p></section>',
    '</body></html>',
  ].join('\n');
  writeFileSync(path.join(root, 'docs/privacy-policy.html'), html, 'utf8');

  // museum-web
  mkdirSync(path.join(root, 'museum-web/src/lib'), { recursive: true });
  const webTs = [
    '// GENERATED — version: 1.0.0',
    '// GENERATED — lastUpdated: 2026-05-21',
    "export const sectionIds = ['controller','recipients','minors'] as const;",
    "export const recipients = ['OpenAI','DeepSeek','Brevo'] as const;",
  ].join('\n');
  writeFileSync(path.join(root, 'museum-web/src/lib/privacy-content.ts'), webTs, 'utf8');

  // museum-frontend
  mkdirSync(path.join(root, 'museum-frontend/features/legal'), { recursive: true });
  const feTs = [
    '// GENERATED — version: 1.0.0',
    '// GENERATED — lastUpdated: 2026-05-21',
    "export const sectionIds = ['controller','recipients','minors'] as const;",
    "export const recipients = ['OpenAI','DeepSeek','Brevo'] as const;",
  ].join('\n');
  writeFileSync(
    path.join(root, 'museum-frontend/features/legal/privacyPolicyContent.ts'),
    feTs,
    'utf8',
  );
}

function runSentinel(root: string): { exitCode: number | null; stdout: string; stderr: string } {
  const res = spawnSync('node', [SENTINEL, '--root', root], {
    encoding: 'utf8',
    timeout: 15_000,
  });
  return {
    exitCode: res.status,
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? '',
  };
}

describe('T2.2 / R15 — privacy-content-drift sentinel', () => {
  let fixturesDir: string;

  beforeEach(() => {
    fixturesDir = mkdtempSync(path.join(tmpdir(), 'privacy-drift-'));
    buildSyncedFixtures(fixturesDir);
  });

  afterEach(() => {
    rmSync(fixturesDir, { recursive: true, force: true });
  });

  describe('positive — in-sync surfaces', () => {
    it('exits 0 when canonical ↔ HTML ↔ web ↔ FE all aligned', () => {
      const result = runSentinel(fixturesDir);
      expect(result.exitCode).toBe(0);
    });
  });

  describe('negative-1 — HTML lastUpdated drift', () => {
    it('exits ≠ 0 and names "HTML" when HTML lastUpdated diverges', () => {
      const htmlPath = path.join(fixturesDir, 'docs/privacy-policy.html');
      const before = require('node:fs').readFileSync(htmlPath, 'utf8') as string;
      const mutated = before.replace('2026-05-21', '2025-12-31');
      writeFileSync(htmlPath, mutated, 'utf8');

      const result = runSentinel(fixturesDir);
      expect(result.exitCode).not.toBe(0);
      const output = `${result.stdout}\n${result.stderr}`;
      expect(output).toMatch(/HTML/i);
    });
  });

  describe('negative-2 — FE vendor drop', () => {
    it('exits ≠ 0 and names "museum-frontend" + dropped vendor when a recipient is removed from FE', () => {
      const fePath = path.join(
        fixturesDir,
        'museum-frontend/features/legal/privacyPolicyContent.ts',
      );
      const before = require('node:fs').readFileSync(fePath, 'utf8') as string;
      // Drop DeepSeek from the FE recipients tuple.
      const mutated = before.replace("['OpenAI','DeepSeek','Brevo']", "['OpenAI','Brevo']");
      expect(mutated).not.toBe(before); // sanity: the replacement happened
      writeFileSync(fePath, mutated, 'utf8');

      const result = runSentinel(fixturesDir);
      expect(result.exitCode).not.toBe(0);
      const output = `${result.stdout}\n${result.stderr}`;
      expect(output).toMatch(/museum-frontend/i);
      expect(output).toMatch(/deepseek/i);
    });
  });

  describe('negative-3 — web section ID drift', () => {
    it('exits ≠ 0 and names "museum-web" when section IDs diverge', () => {
      const webPath = path.join(fixturesDir, 'museum-web/src/lib/privacy-content.ts');
      const before = require('node:fs').readFileSync(webPath, 'utf8') as string;
      const mutated = before.replace(
        "['controller','recipients','minors']",
        "['controller','recipients','jeunesse']", // 'minors' → 'jeunesse'
      );
      expect(mutated).not.toBe(before);
      writeFileSync(webPath, mutated, 'utf8');

      const result = runSentinel(fixturesDir);
      expect(result.exitCode).not.toBe(0);
      const output = `${result.stdout}\n${result.stderr}`;
      expect(output).toMatch(/museum-web/i);
    });
  });

  describe('negative-4 — HTML age string regression', () => {
    it('exits ≠ 0 when HTML Article 10 reverts to "16 ans"', () => {
      const htmlPath = path.join(fixturesDir, 'docs/privacy-policy.html');
      const before = require('node:fs').readFileSync(htmlPath, 'utf8') as string;
      const mutated = before.replace('15 ans selon CNIL', '16 ans selon CNIL');
      writeFileSync(htmlPath, mutated, 'utf8');

      const result = runSentinel(fixturesDir);
      expect(result.exitCode).not.toBe(0);
      const output = `${result.stdout}\n${result.stderr}`;
      expect(output).toMatch(/16\s+ans|age|minor/i);
    });
  });

  describe('negative-5 — vendor name only in comment, not in rendered content', () => {
    it('exits ≠ 0 and names the surface when a vendor is dropped from FE exports but still mentioned in a JS comment', () => {
      const fePath = path.join(
        fixturesDir,
        'museum-frontend/features/legal/privacyPolicyContent.ts',
      );
      const before = require('node:fs').readFileSync(fePath, 'utf8') as string;
      // DeepSeek vanishes from the actual exported tuple but stays in a comment
      // (JSDoc / // / /* */). A naive grep would accept the comment mention; the
      // sentinel MUST strip comments before scanning and still flag the surface.
      const mutated = before.replace(
        "export const recipients = ['OpenAI','DeepSeek','Brevo'] as const;",
        [
          '/**',
          ' * NOTE: DeepSeek used to be listed here. Kept the mention in this',
          ' * JSDoc for historical context — see ADR-0XX.',
          ' */',
          '// DeepSeek removal tracked in change log.',
          '/* legacy: DeepSeek */',
          "export const recipients = ['OpenAI','Brevo'] as const;",
        ].join('\n'),
      );
      expect(mutated).not.toBe(before); // sanity: replacement happened
      // Sanity-check the mutated source: 'DeepSeek' is still textually present
      // (so a raw `text.includes` would PASS), but only inside comments.
      expect(mutated).toMatch(/DeepSeek/);
      writeFileSync(fePath, mutated, 'utf8');

      const result = runSentinel(fixturesDir);
      expect(result.exitCode).not.toBe(0);
      const output = `${result.stdout}\n${result.stderr}`;
      expect(output).toMatch(/museum-frontend/i);
      expect(output).toMatch(/deepseek/i);
    });
  });

  it('emits a "## Sentinel report" GitHub Actions block on failure', () => {
    // Mutate any surface to provoke failure.
    const htmlPath = path.join(fixturesDir, 'docs/privacy-policy.html');
    const before = require('node:fs').readFileSync(htmlPath, 'utf8') as string;
    writeFileSync(htmlPath, before.replace('2026-05-21', '1999-01-01'), 'utf8');

    const result = runSentinel(fixturesDir);
    expect(result.exitCode).not.toBe(0);
    const output = `${result.stdout}\n${result.stderr}`;
    expect(output).toMatch(/##\s*Sentinel\s+report/i);
  });

  // cpSync silences unused-import linter while still asserting it imported OK
  it('cpSync helper is loadable (sanity)', () => {
    expect(typeof cpSync).toBe('function');
  });
});
