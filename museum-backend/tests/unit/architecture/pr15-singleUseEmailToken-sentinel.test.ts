import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BACKEND_ROOT = resolve(__dirname, '../../..');

const GENERATION_FILES = [
  'src/modules/auth/useCase/registration/register.useCase.ts',
  'src/modules/auth/useCase/password/forgotPassword.useCase.ts',
  'src/modules/auth/useCase/email/changeEmail.useCase.ts',
] as const;

const CONSUME_FILES = [
  'src/modules/auth/useCase/registration/verifyEmail.useCase.ts',
  'src/modules/auth/useCase/password/resetPassword.useCase.ts',
  'src/modules/auth/useCase/email/confirmEmailChange.useCase.ts',
] as const;

const ALL_FILES = [...GENERATION_FILES, ...CONSUME_FILES] as const;

const RANDOM_BYTES_PATTERN = /crypto\.randomBytes\s*\(\s*32\s*\)/;

const CREATE_HASH_SHA256_PATTERN = /crypto\.createHash\s*\(\s*['"]sha256['"]\s*\)/;

const NODE_CRYPTO_IMPORT_PATTERN = /import\s+crypto\s+from\s+['"]node:crypto['"]/;

const HELPER_IMPORT_PATTERN =
  /import\s*(?:type\s+)?\{[^}]*\}\s*from\s+['"]@shared\/security\/single-use-email-token['"]/;

const ISSUE_IMPORTED_PATTERN =
  /import\s*(?:type\s+)?\{[^}]*\bissueEmailToken\b[^}]*\}\s*from\s+['"]@shared\/security\/single-use-email-token['"]/;
const HASH_IMPORTED_PATTERN =
  /import\s*(?:type\s+)?\{[^}]*\bhashEmailTokenForLookup\b[^}]*\}\s*from\s+['"]@shared\/security\/single-use-email-token['"]/;

const ISSUE_USED_PATTERN = /\bissueEmailToken\s*\(/;
const HASH_USED_PATTERN = /\bhashEmailTokenForLookup\s*\(/;

function readSource(rel: string): string {
  return readFileSync(resolve(BACKEND_ROOT, rel), 'utf8');
}

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
