import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');

const TARGETS = [
  'src/modules/leads/adapters/secondary/notifier/brevo-beta-signup.notifier.ts',
  'src/modules/leads/useCase/submitPaywallInterest.useCase.ts',
] as const;

const PATTERN_EMAIL_DOT_SPLIT = /email\.split\(['"]@['"]\)\[1\]/g;
const PATTERN_ANY_DOT_SPLIT = /\.split\(['"]@['"]\)\[1\]/g;
const IMPORT_EXTRACT_EMAIL_DOMAIN =
  /import\s*\{[^}]*\bextractEmailDomain\b[^}]*\}\s*from\s*['"]@shared\/pii\/extractEmailDomain['"]/;

function readTarget(relPath: string): string {
  return readFileSync(resolve(REPO_ROOT, relPath), 'utf8');
}

function matchCount(content: string, pattern: RegExp): number {
  const matches = content.match(pattern);
  return matches ? matches.length : 0;
}

describe('PR-12 sentinel: extractEmailDomain codemod completeness', () => {
  describe.each(TARGETS)('%s', (relPath) => {
    it("contains zero raw `email.split('@')[1]` patterns", () => {
      const content = readTarget(relPath);
      const count = matchCount(content, PATTERN_EMAIL_DOT_SPLIT);
      expect(count).toBe(0);
    });

    it("contains zero raw `.split('@')[1]` chain patterns (catches trim()/normalize() variants)", () => {
      const content = readTarget(relPath);
      const count = matchCount(content, PATTERN_ANY_DOT_SPLIT);
      expect(count).toBe(0);
    });

    it('imports `extractEmailDomain` from `@shared/pii/extractEmailDomain`', () => {
      const content = readTarget(relPath);
      expect(IMPORT_EXTRACT_EMAIL_DOMAIN.test(content)).toBe(true);
    });
  });
});
