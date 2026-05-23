/**
 * PR-3 sentinel — structural anti-regression test.
 *
 * Asserts that the 4 auth use case files have adopted the `notFound()` helper
 * from `@shared/errors/app.error` instead of inline-instantiating an `AppError`
 * with `code: 'NOT_FOUND'`. The substitution is performed in the green phase of
 * RUN_ID 2026-05-23-pr-3-notFound-codemod.
 *
 * - Pre-codemod (red phase): FAILS — pattern present, import absent.
 * - Post-codemod (green phase): PASSES — pattern removed, import added.
 *
 * Source-of-truth specs:
 *   .claude/skills/team/team-state/2026-05-23-pr-3-notFound-codemod/spec.md  (R2, R4, AC4, AC5)
 *   .claude/skills/team/team-state/2026-05-23-pr-3-notFound-codemod/design.md (§4.1)
 *
 * The test reads the source files via `fs.readFileSync` (no runtime imports of
 * the use cases) so it cannot be neutralised by mocking. It is a pure
 * structural pattern check, not a behavioural test.
 */

import * as fs from 'fs';
import * as path from 'path';

// Repo root = museum-backend/tests/unit/auth → ../../../.. (4 levels up)
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

/**
 * The 4 PR-3 target files (paths relative to repo root). Hardcoded to keep the
 * sentinel narrowly scoped — explicit out-of-scope per spec §7.
 */
const TARGETS: readonly string[] = [
  'museum-backend/src/modules/auth/useCase/password/changePassword.useCase.ts',
  'museum-backend/src/modules/auth/useCase/email/changeEmail.useCase.ts',
  'museum-backend/src/modules/auth/useCase/totp/disableMfa.useCase.ts',
  'museum-backend/src/modules/auth/useCase/totp/enrollMfa.useCase.ts',
];

/**
 * Matches the inline pattern we are eradicating. Anchored on
 * `throw new AppError(` then a `{` block containing `code: 'NOT_FOUND'` or
 * `code: "NOT_FOUND"`. Tolerates whitespace and other keys in the literal.
 *
 * Quoted classes use a character class instead of literal quotes to satisfy
 * lint and stay regex-safe.
 */
const INLINE_NOT_FOUND_PATTERN =
  /throw\s+new\s+AppError\s*\(\s*\{[^}]*code:\s*['"]NOT_FOUND['"][^}]*\}\s*\)/;

/**
 * Matches an import line that pulls something from `@shared/errors/app.error`.
 * Captures the named-import body between braces so we can assert membership.
 */
const APP_ERROR_IMPORT_LINE =
  /import\s*\{\s*([^}]+?)\s*\}\s*from\s+['"]@shared\/errors\/app\.error['"]\s*;?/;

function readTarget(relPath: string): string {
  const abs = path.join(REPO_ROOT, relPath);
  return fs.readFileSync(abs, 'utf8');
}

describe('PR-3 — no inline AppError NOT_FOUND in target files', () => {
  it.each(TARGETS)(
    "%s does not contain inline `new AppError({ ..., code: 'NOT_FOUND' ... })`",
    (relPath) => {
      const source = readTarget(relPath);
      const match = INLINE_NOT_FOUND_PATTERN.exec(source);
      expect(match).toBeNull();
    },
  );
});

describe('PR-3 — notFound imported in target files', () => {
  it.each(TARGETS)('%s imports `notFound` from `@shared/errors/app.error`', (relPath) => {
    const source = readTarget(relPath);
    const importMatch = APP_ERROR_IMPORT_LINE.exec(source);
    // Sanity: every target currently imports from app.error (verified in spec
    // §3). If this line ever disappears, the file shape changed and the test
    // must fail loudly rather than silently passing.
    expect(importMatch).not.toBeNull();
    const namedImports = importMatch![1]
      .split(',')
      .map((name) => name.trim())
      .filter((name) => name.length > 0);
    expect(namedImports).toContain('notFound');
  });
});
