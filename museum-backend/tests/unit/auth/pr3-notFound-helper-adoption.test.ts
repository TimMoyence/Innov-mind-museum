/**
 * PR-3 sentinel — structural anti-regression test.
 *
 * Asserts that the remaining PR-3 auth use case file has adopted the `notFound()`
 * helper from `@shared/errors/app.error` instead of inline-instantiating an
 * `AppError` with `code: 'NOT_FOUND'`. The substitution is performed in the
 * green phase of RUN_ID 2026-05-23-pr-3-notFound-codemod.
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
 *
 * Scope reduction 2026-05-23 (RUN_ID 2026-05-23-pr-9-assertPasswordReauth) —
 * Originally targeted 4 files (changePassword, changeEmail, disableMfa,
 * enrollMfa). PR-9 hoisted the password-reauth + user-lookup + 404 throw out
 * of changePassword/changeEmail/disableMfa into a shared
 * `assertPasswordReauth()` helper, so those three files no longer import
 * `notFound` directly (the helper does). enrollMfa is the only remaining
 * site that still issues a direct `notFound()` call after a user lookup
 * (its flow has no password-reauth precondition, so PR-9 did not sweep it).
 * TARGETS is therefore narrowed to `enrollMfa.useCase.ts` to keep the
 * sentinel scoped to the actual post-PR-9 surface.
 */

import * as fs from 'fs';
import * as path from 'path';

// Repo root = museum-backend/tests/unit/auth → ../../../.. (4 levels up)
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

/**
 * Remaining PR-3 target file (path relative to repo root). Hardcoded to keep
 * the sentinel narrowly scoped — explicit out-of-scope per spec §7.
 *
 * Post-PR-9: changePassword/changeEmail/disableMfa now route their 404 throw
 * through `assertPasswordReauth()`; enrollMfa is the only direct-import site
 * left (no password-reauth precondition, helper not applicable).
 */
const TARGETS: readonly string[] = [
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
