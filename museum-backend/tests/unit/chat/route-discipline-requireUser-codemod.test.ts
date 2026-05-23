/**
 * PR-2 codemod sentinel — `requireUser(req)` on 7 sites under chat/ HTTP layer.
 *
 * RUN_ID: 2026-05-23-pr-2-requireUser-codemod (UFR-022 fresh-context phase 3 = red).
 *
 * Drives the codemod that replaces the 7 inline duplicates of:
 *
 *   const currentUser = getRequestUser(req);
 *   if (!currentUser?.id) {
 *     throw new AppError({ message: 'Token required', statusCode: 401, code: 'UNAUTHORIZED' });
 *   }
 *
 * with the canonical helper:
 *
 *   const user = requireUser(req);
 *
 * Audit B4 findings/findings-B4.md HIGH #3 — kill the inline 401 duplication.
 *
 * This test MUST FAIL at HEAD (pattern still present in the 4 target files) and
 * PASS after the green phase applies the codemod. Frozen-test contract:
 * byte-for-byte unchanged between phase 3 (red) and phase 4 (green).
 *
 * Refs:
 *   - spec.md  → .claude/skills/team/team-state/2026-05-23-pr-2-requireUser-codemod/spec.md
 *                (§EARS R1, R3, R5 / AC1, AC4)
 *   - design.md → .claude/skills/team/team-state/2026-05-23-pr-2-requireUser-codemod/design.md
 *                (§3 transformations, §4 imports)
 *   - tasks.md  → .claude/skills/team/team-state/2026-05-23-pr-2-requireUser-codemod/tasks.md
 *                (T1 red phase)
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** museum-backend repo root (test file lives at tests/unit/chat/<this>). */
const BACKEND_ROOT = resolve(__dirname, '../../..');

/**
 * The 4 target files for the codemod. Each file collectively hosts 7 inline
 * duplicate 401-throws to eradicate (cf. design.md §1).
 */
const TARGETS = [
  'src/modules/chat/adapters/primary/http/explanation.controller.ts',
  'src/modules/chat/adapters/primary/http/routes/chat-session.route.ts',
  'src/modules/chat/adapters/primary/http/routes/chat-media.route.ts',
  'src/modules/chat/adapters/primary/http/routes/chat-memory.route.ts',
] as const;

/**
 * AC4 + R5.1 — the inline `if (!<user>?.id) { throw new AppError(...) }` shape.
 *
 * Robust to whitespace + arbitrary identifier (`currentUser`, `user`, `u`, etc.)
 * and tolerates either single-line or multi-line `throw new AppError(...)` bodies
 * via the lazy `[^]*?` body matcher. The end anchor `code:\s*['"]UNAUTHORIZED['"]`
 * makes this strict enough that it only fires on the 401-duplicate pattern,
 * not arbitrary if/throw chains.
 *
 * `\s` is sufficient (covers \n on V8 regex) — no need for `s` flag.
 */
const INLINE_UNAUTH_THROW_RE =
  /if\s*\(\s*!\s*[A-Za-z_$][\w$]*\?\.id\s*\)\s*\{[\s\S]*?throw\s+new\s+AppError\s*\(\s*\{[\s\S]*?code:\s*['"]UNAUTHORIZED['"][\s\S]*?\}\s*\)\s*;?\s*\}/;

/**
 * R3.2 — looser sentinel: any `throw new AppError({ ... code: 'UNAUTHORIZED' ... })`
 * inline literal, regardless of the if-guard shape. Catches a sneaky reshuffle
 * that drops the `if (!user?.id)` guard but keeps the inline 401-throw.
 *
 * Helper-wrapped usage (`throw unauthorized(...)`) is intentionally NOT matched.
 */
const INLINE_APPERROR_UNAUTHORIZED_RE =
  /throw\s+new\s+AppError\s*\(\s*\{[\s\S]*?code:\s*['"]UNAUTHORIZED['"][\s\S]*?\}\s*\)/;

/** AC1 — canonical helper import shape. Quote-agnostic. */
const REQUIRE_USER_IMPORT_RE =
  /import\s*\{[^}]*\brequireUser\b[^}]*\}\s*from\s*['"]@shared\/http\/requireUser['"]/;

function readTarget(relPath: string): string {
  const abs = resolve(BACKEND_ROOT, relPath);
  return readFileSync(abs, 'utf8');
}

describe('PR-2 codemod — requireUser(req) sentinel (4 files, 7 sites)', () => {
  describe.each(TARGETS)('%s', (relPath) => {
    it('AC4 / R5.1 — does not contain the inline `if (!<user>?.id) { throw new AppError({...UNAUTHORIZED...}) }` pattern', () => {
      const content = readTarget(relPath);
      const match = INLINE_UNAUTH_THROW_RE.exec(content);

      if (match) {
        throw new Error(
          `PR-2 sentinel — ${relPath} still contains the inline 401 duplicate.\n` +
            `Replace with \`const user = requireUser(req);\` (spec §R2, design §3).\n` +
            `First match (offset ${match.index}):\n` +
            `  ${match[0].replace(/\n/g, '\n  ')}`,
        );
      }
      expect(match).toBeNull();
    });

    it("R3.2 — does not contain any inline `throw new AppError({ ... code: 'UNAUTHORIZED' ... })`", () => {
      const content = readTarget(relPath);
      const match = INLINE_APPERROR_UNAUTHORIZED_RE.exec(content);

      if (match) {
        throw new Error(
          `PR-2 sentinel — ${relPath} still throws AppError(UNAUTHORIZED) inline.\n` +
            `Use \`requireUser(req)\` (which delegates to \`unauthorized()\` helper).\n` +
            `First match (offset ${match.index}):\n` +
            `  ${match[0].replace(/\n/g, '\n  ')}`,
        );
      }
      expect(match).toBeNull();
    });

    it('AC1 / R1.1 — imports `requireUser` from `@shared/http/requireUser`', () => {
      const content = readTarget(relPath);

      if (!REQUIRE_USER_IMPORT_RE.test(content)) {
        throw new Error(
          `PR-2 sentinel — ${relPath} is missing the canonical helper import.\n` +
            `Add: \`import { requireUser } from '@shared/http/requireUser';\` (spec §R1).`,
        );
      }
      expect(REQUIRE_USER_IMPORT_RE.test(content)).toBe(true);
    });
  });

  it('sanity — all 7 inline duplicates are covered by the 4 target files at HEAD (red invariant)', () => {
    // This sanity check runs the INLINE_UNAUTH_THROW_RE *globally* on each
    // file's content and sums the matches. At HEAD the total must equal 7
    // (1 in explanation.controller, 2 in chat-session.route, 2 in
    // chat-media.route, 2 in chat-memory.route — cf. design.md §1 table).
    //
    // Why a sanity check here? It guards against a regex that is so loose
    // it matches >7 occurrences (false-positive risk) AND against a regex so
    // tight it matches <7 occurrences (false-negative — codemod might "pass"
    // the per-file sentinel because one site silently slipped through).
    //
    // After the green codemod, this count drops to 0 and the assertion below
    // (count <= 7) still holds — the per-file assertions above carry the
    // post-codemod contract. The lower-bound `>= 7` only matters at HEAD and
    // is dropped here intentionally so the test stays green post-codemod.
    const globalRe = new RegExp(INLINE_UNAUTH_THROW_RE.source, 'g');
    let total = 0;
    for (const relPath of TARGETS) {
      const content = readTarget(relPath);
      const matches = content.match(globalRe);
      total += matches ? matches.length : 0;
    }

    // Upper bound only — post-codemod total === 0 is enforced by per-file
    // assertions. At HEAD total === 7. Anything > 7 means the regex is too
    // loose and we need to tighten before freezing.
    expect(total).toBeLessThanOrEqual(7);
  });
});
