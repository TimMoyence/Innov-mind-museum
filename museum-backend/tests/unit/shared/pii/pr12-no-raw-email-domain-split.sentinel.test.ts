import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * RED (UFR-022) — PR-12 codemod sentinel, RUN_ID 2026-05-23-pr-12-extractEmailDomain.
 *
 * Filesystem-scoped scan of the 2 target files for the codemod:
 *   - museum-backend/src/modules/leads/adapters/secondary/notifier/brevo-beta-signup.notifier.ts
 *   - museum-backend/src/modules/leads/useCase/submitPaywallInterest.useCase.ts
 *
 * Asserts (post-GREEN expectation, fails pre-GREEN):
 *   1. No `email.split('@')[1]` literal pattern (covers `payload.email.split('@')[1]`,
 *      `email.split('@')[1]`, single- or double-quoted '@').
 *   2. No `.split('@')[1]` chain on ANY expression — catches the `email.trim().split('@')[1]`
 *      variant that pattern (1) would miss.
 *   3. Both target files import `extractEmailDomain` from `@shared/pii/extractEmailDomain`.
 *
 * Pre-GREEN state: brevo-beta-signup.notifier.ts has 4 raw split sites,
 * submitPaywallInterest.useCase.ts has 1 → suite RED. Post-GREEN: 0 / 0 / both imports present.
 *
 * The frozen-test contract (UFR-022) byte-freezes this file from RED→GREEN.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');

const TARGETS = [
  'src/modules/leads/adapters/secondary/notifier/brevo-beta-signup.notifier.ts',
  'src/modules/leads/useCase/submitPaywallInterest.useCase.ts',
] as const;

// (1) `email.split('@')[1]` — identifier-prefixed, single or double quoted '@'.
const PATTERN_EMAIL_DOT_SPLIT = /email\.split\(['"]@['"]\)\[1\]/g;
// (2) `.split('@')[1]` — any chain (catches `email.trim().split('@')[1]` etc.).
const PATTERN_ANY_DOT_SPLIT = /\.split\(['"]@['"]\)\[1\]/g;
// (3) named import from the canonical helper module.
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
