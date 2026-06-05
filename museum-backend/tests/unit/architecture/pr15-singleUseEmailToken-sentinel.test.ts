/**
 * UFR-022 red phase — PR-15 single-use email token sweep sentinel.
 * RUN_ID: 2026-05-23-pr-15-singleUseEmailToken.
 *
 * Repo-structural assertion (filesystem scan via `fs.readFileSync`, NOT a
 * behavioural test → cannot be neutralised by mocking). Locks the DRY-sweep
 * contract from spec §4 (R2.1/R2.2/R2.4) + design §3 / §4.2 + tasks T9: after
 * the green phase, the inline crypto pattern (`crypto.randomBytes(32)` /
 * `crypto.createHash('sha256')`) and the `node:crypto` import must be gone from
 * all 6 single-use-email-token useCases, each delegating instead to the shared
 * helper `@shared/security/single-use-email-token`.
 *
 * Generation sites (G1/G2/G3) MUST import + use `issueEmailToken`.
 * Consume sites (C1/C2/C3) MUST import + use `hashEmailTokenForLookup`.
 *
 * Pre-green: this test FAILS because every one of the 6 files still imports
 * `crypto from 'node:crypto'`, the 3 generation files still contain
 * `crypto.randomBytes(32)`, all 6 still contain `crypto.createHash('sha256')`,
 * and none import the helper (verified via grep 2026-05-23). Post-green → PASS,
 * byte-frozen.
 *
 * Patterns are searched line-by-line so failure messages cite file:line and
 * help the green editor target the migration precisely.
 *
 * Frozen-test discipline (UFR-022): this file is sha256-hashed in
 * red-test-manifest.json. Green phase MUST NOT modify it. Suspected bug →
 * emit `BLOCK-TEST-WRONG <file>:<line> <reason>` and STOP.
 *
 * Spec sources of truth:
 *   .claude/skills/team/team-state/2026-05-23-pr-15-singleUseEmailToken/spec.md  §1, R2.1/R2.2/R2.4, AC4/AC5/AC6
 *   .claude/skills/team/team-state/2026-05-23-pr-15-singleUseEmailToken/design.md §0, §3, §4.2
 *   .claude/skills/team/team-state/2026-05-23-pr-15-singleUseEmailToken/tasks.md  T9
 *   precedent: tests/unit/auth/pr3-notFound-helper-adoption.test.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// __dirname = museum-backend/tests/unit/architecture
// ../../..  = museum-backend (backend root)
const BACKEND_ROOT = resolve(__dirname, '../../..');

/** Generation sites — must adopt `issueEmailToken` (spec G1/G2/G3, AC4). */
const GENERATION_FILES = [
  'src/modules/auth/useCase/registration/register.useCase.ts',
  'src/modules/auth/useCase/password/forgotPassword.useCase.ts',
  'src/modules/auth/useCase/email/changeEmail.useCase.ts',
] as const;

/** Consume sites — must adopt `hashEmailTokenForLookup` (spec C1/C2/C3, AC5). */
const CONSUME_FILES = [
  'src/modules/auth/useCase/registration/verifyEmail.useCase.ts',
  'src/modules/auth/useCase/password/resetPassword.useCase.ts',
  'src/modules/auth/useCase/email/confirmEmailChange.useCase.ts',
] as const;

/** All 6 files share the no-inline-crypto + no-node:crypto-import contract. */
const ALL_FILES = [...GENERATION_FILES, ...CONSUME_FILES] as const;

/** Inline 32-byte entropy draw the sweep removes (spec R2.1). */
const RANDOM_BYTES_PATTERN = /crypto\.randomBytes\s*\(\s*32\s*\)/;

/** Inline SHA-256 hash the sweep removes from all 6 sites (spec R2.1/R2.2). */
const CREATE_HASH_SHA256_PATTERN = /crypto\.createHash\s*\(\s*['"]sha256['"]\s*\)/;

/** The `node:crypto` default import that becomes orphaned post-sweep (R2.4). */
const NODE_CRYPTO_IMPORT_PATTERN = /import\s+crypto\s+from\s+['"]node:crypto['"]/;

/** Required helper import (tolerates extra named imports / quote style). */
const HELPER_IMPORT_PATTERN =
  /import\s*(?:type\s+)?\{[^}]*\}\s*from\s+['"]@shared\/security\/single-use-email-token['"]/;

const ISSUE_IMPORTED_PATTERN =
  /import\s*(?:type\s+)?\{[^}]*\bissueEmailToken\b[^}]*\}\s*from\s+['"]@shared\/security\/single-use-email-token['"]/;
const HASH_IMPORTED_PATTERN =
  /import\s*(?:type\s+)?\{[^}]*\bhashEmailTokenForLookup\b[^}]*\}\s*from\s+['"]@shared\/security\/single-use-email-token['"]/;

/** Usage (call) of each helper somewhere in the file body (AC4/AC5). */
const ISSUE_USED_PATTERN = /\bissueEmailToken\s*\(/;
const HASH_USED_PATTERN = /\bhashEmailTokenForLookup\s*\(/;

function readSource(rel: string): string {
  return readFileSync(resolve(BACKEND_ROOT, rel), 'utf8');
}

/**
 * First line index (1-based) matching `rx`, or -1.
 * @param source
 * @param rx
 */
function firstLine(source: string, rx: RegExp): number {
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (typeof line === 'string' && rx.test(line)) return i + 1;
  }
  return -1;
}

describe('PR-15 sentinel — no inline single-use email token crypto in the 6 useCases', () => {
  describe.each(ALL_FILES)('%s', (rel) => {
    it('does NOT import `crypto from "node:crypto"`', () => {
      const source = readSource(rel);
      const line = firstLine(source, NODE_CRYPTO_IMPORT_PATTERN);
      if (line !== -1) {
        throw new Error(
          `PR-15 sweep regression in ${rel}:${line}\n` +
            "  forbidden: import crypto from 'node:crypto' (orphaned after sweep)\n" +
            '  remediation: remove the import; delegate to @shared/security/single-use-email-token',
        );
      }
      expect(NODE_CRYPTO_IMPORT_PATTERN.test(source)).toBe(false);
    });

    it("does NOT contain inline `crypto.createHash('sha256')`", () => {
      const source = readSource(rel);
      const line = firstLine(source, CREATE_HASH_SHA256_PATTERN);
      if (line !== -1) {
        throw new Error(
          `PR-15 sweep regression in ${rel}:${line}\n` +
            "  forbidden: inline crypto.createHash('sha256')\n" +
            '  remediation: use issueEmailToken() / hashEmailTokenForLookup() per design.md §3',
        );
      }
      expect(CREATE_HASH_SHA256_PATTERN.test(source)).toBe(false);
    });
  });

  describe.each(GENERATION_FILES)('generation %s', (rel) => {
    it('does NOT contain inline `crypto.randomBytes(32)`', () => {
      const source = readSource(rel);
      const line = firstLine(source, RANDOM_BYTES_PATTERN);
      if (line !== -1) {
        throw new Error(
          `PR-15 sweep regression in ${rel}:${line}\n` +
            '  forbidden: inline crypto.randomBytes(32)\n' +
            '  remediation: use issueEmailToken() per design.md §3',
        );
      }
      expect(RANDOM_BYTES_PATTERN.test(source)).toBe(false);
    });
  });
});

describe('PR-15 sentinel — helper adoption in the 6 useCases', () => {
  describe.each(GENERATION_FILES)('generation %s adopts issueEmailToken', (rel) => {
    it('imports `issueEmailToken` from `@shared/security/single-use-email-token`', () => {
      const source = readSource(rel);
      expect(source).toMatch(HELPER_IMPORT_PATTERN);
      expect(source).toMatch(ISSUE_IMPORTED_PATTERN);
    });

    it('calls `issueEmailToken(...)`', () => {
      const source = readSource(rel);
      expect(source).toMatch(ISSUE_USED_PATTERN);
    });
  });

  describe.each(CONSUME_FILES)('consume %s adopts hashEmailTokenForLookup', (rel) => {
    it('imports `hashEmailTokenForLookup` from `@shared/security/single-use-email-token`', () => {
      const source = readSource(rel);
      expect(source).toMatch(HELPER_IMPORT_PATTERN);
      expect(source).toMatch(HASH_IMPORTED_PATTERN);
    });

    it('calls `hashEmailTokenForLookup(...)`', () => {
      const source = readSource(rel);
      expect(source).toMatch(HASH_USED_PATTERN);
    });
  });
});
