/**
 * UFR-022 red phase — PR-9 assertPasswordReauth sweep sentinel.
 * RUN_ID: 2026-05-23-pr-9-assertPasswordReauth.
 *
 * Repo-structural assertion (filesystem scan, NOT behaviour). Locks AC-16/AC-17
 * from spec §7.5 + design §4.3:
 *   1. After green sweeps the 3 useCases, NONE of the 3 enumerated files
 *      contains an inline `bcrypt.compare(currentPassword, …)` re-auth call.
 *      (The `isSame` bcrypt.compare in changePassword compares newPassword to
 *      user.password — that remains, sentinel only forbids the
 *      `currentPassword` form.)
 *   2. NONE of the 3 files contains the literal substring `social-only` —
 *      the helper is the single source of truth for that message.
 *   3. EACH of the 3 files imports `assertPasswordReauth` from
 *      `@modules/auth/useCase/shared/assertPasswordReauth`.
 *
 * Pre-green: this test FAILS — the current sources still have:
 *   - 3 × `bcrypt.compare(currentPassword, user.password)` re-auth call sites
 *     (changePassword L31, changeEmail L37, disableMfa L30).
 *   - 3 × inline social-only message strings.
 *   - ZERO import of `@modules/auth/useCase/shared/assertPasswordReauth`
 *     (helper module does not exist yet).
 *
 * Frozen-test discipline (UFR-022): this file is sha256-hashed in
 * `red-test-manifest.json`. Green phase MUST NOT modify it. Suspected bug →
 * emit `BLOCK-TEST-WRONG <file>:<line> <reason>`, do NOT touch.
 *
 * Spec sources of truth:
 *   .claude/skills/team/team-state/2026-05-23-pr-9-assertPasswordReauth/spec.md §3.1 (3 sites)
 *                                                                              §7.5 (AC-16, AC-17)
 *   .claude/skills/team/team-state/2026-05-23-pr-9-assertPasswordReauth/design.md §4.3 (sentinel design)
 *                                                                                 §3   (per-site sweep)
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// __dirname = museum-backend/tests/unit/architecture
// ../../..  = museum-backend
const BACKEND_ROOT = resolve(__dirname, '../../..');

/**
 * The 3 PR-9 sweep targets (spec §3.1). Paths are relative to museum-backend/
 * so the assertion is portable across worktrees.
 */
const TARGETS: readonly string[] = [
  'src/modules/auth/useCase/password/changePassword.useCase.ts',
  'src/modules/auth/useCase/email/changeEmail.useCase.ts',
  'src/modules/auth/useCase/totp/disableMfa.useCase.ts',
];

/**
 * Matches the inline re-auth pattern we are eradicating:
 *   `bcrypt.compare(currentPassword, …)` — the parameter name is the discriminator.
 * The `isSame` check in changePassword (`bcrypt.compare(newPassword, user.password)`)
 * is intentionally NOT matched: the regex requires `currentPassword` as the
 * first argument (word-boundary anchored).
 *
 * Tolerates whitespace between tokens.
 */
const INLINE_REAUTH_PATTERN = /bcrypt\.compare\s*\(\s*currentPassword\b/;

/**
 * Matches the literal string `social-only` (case-insensitive). After sweep the
 * helper owns this phrasing exclusively; the 3 sweep targets must contain zero
 * occurrence (including in code paths and comments).
 */
const SOCIAL_ONLY_LITERAL = /social-only/i;

/**
 * Matches an import that pulls `assertPasswordReauth` from the canonical
 * shared path. Tolerates:
 *   - extra named imports on the same line,
 *   - single or double quotes around the module specifier,
 *   - optional trailing semicolon.
 */
const ASSERT_PASSWORD_REAUTH_IMPORT =
  /import\s*\{[^}]*\bassertPasswordReauth\b[^}]*\}\s*from\s+['"]@modules\/auth\/useCase\/shared\/assertPasswordReauth['"]/;

function readTarget(relPath: string): string {
  const abs = resolve(BACKEND_ROOT, relPath);
  return readFileSync(abs, 'utf8');
}

describe('PR-9 sentinel — no inline bcrypt.compare(currentPassword, …) in swept useCases', () => {
  it.each(TARGETS)('%s does not contain inline `bcrypt.compare(currentPassword, …)`', (relPath) => {
    const source = readTarget(relPath);
    const match = INLINE_REAUTH_PATTERN.exec(source);
    expect(match).toBeNull();
  });
});

describe('PR-9 sentinel — no inline `social-only` literal in swept useCases', () => {
  it.each(TARGETS)('%s does not contain the literal `social-only`', (relPath) => {
    const source = readTarget(relPath);
    const match = SOCIAL_ONLY_LITERAL.exec(source);
    expect(match).toBeNull();
  });
});

describe('PR-9 sentinel — assertPasswordReauth imported from shared path', () => {
  it.each(TARGETS)(
    '%s imports `assertPasswordReauth` from `@modules/auth/useCase/shared/assertPasswordReauth`',
    (relPath) => {
      const source = readTarget(relPath);
      expect(source).toMatch(ASSERT_PASSWORD_REAUTH_IMPORT);
    },
  );
});
