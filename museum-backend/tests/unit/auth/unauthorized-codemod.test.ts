/**
 * PR-1 / UFR-022 RED — codemod sentinel.
 *
 * Asserts the 6 target files no longer define a local `unauthorized()` and
 * instead import the canonical helper from `@shared/errors/app.error`. The
 * source files currently each carry a private copy (`const unauthorized = …`)
 * — so every assertion in this suite FAILS until the GREEN phase removes the
 * local definitions and adds the canonical import.
 *
 * Strategy: scan source text on disk (no SUT import). Mirrors the precedent
 * pattern from `tests/unit/chat/td20-no-v5-no-new-client.test.ts` (filesystem
 * sentinel for codemod-style discipline).
 */
/* eslint-disable security/detect-non-literal-fs-filename --
   Justification: filesystem sentinel that reads repo-internal source paths
   built from `__dirname`, never from user input. The non-literal fs args are
   the codemod targets enumerated in PR-1 design.md.
   Approved-by: PR-1 design.md (codemod sentinel, mirrors TD-20). */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC_ROOT = join(__dirname, '..', '..', '..', 'src');

/**
 * Six call-sites currently shipping a local `unauthorized()` helper. PR-1
 * collapses them onto the canonical factory in `@shared/errors/app.error`.
 */
const CODEMOD_TARGETS = [
  'shared/middleware/apiKey.middleware.ts',
  'shared/middleware/authenticated.middleware.ts',
  'modules/auth/useCase/session/token-jwt.service.ts',
  'modules/auth/useCase/session/authSession.service.ts',
  'modules/auth/useCase/session/session-issuer.service.ts',
] as const;

const LOCAL_DEF_RE = /(?:^|\n)\s*(?:export\s+)?(?:const|function)\s+unauthorized\s*[=(]/;
const CANONICAL_IMPORT_RE =
  /from\s+['"](?:@shared\/errors\/app\.error|[./]+(?:shared\/errors\/app\.error|app\.error))['"]/;

describe('PR-1 — `unauthorized()` codemod sentinel', () => {
  describe.each(CODEMOD_TARGETS)('%s', (relPath) => {
    const fullPath = join(SRC_ROOT, relPath);
    // Read once per target; cheap and avoids repeated I/O on each `it`.
    const src = readFileSync(fullPath, 'utf8');

    it('defines no local `unauthorized` helper', () => {
      const match = LOCAL_DEF_RE.exec(src);
      // Surface the matched snippet on failure so the GREEN phase sees exactly
      // which definition still needs deleting.
      expect(match?.[0] ?? null).toBeNull();
    });

    it('imports `unauthorized` from the canonical `@shared/errors/app.error`', () => {
      // The import statement that brings `unauthorized` in MUST resolve to the
      // canonical module. We grep the named binding and confirm the resolved
      // source path matches the canonical alias (or an equivalent relative
      // path back to `src/shared/errors/app.error`).
      const importRe = /import\s*\{[^}]*\bunauthorized\b[^}]*\}\s*from\s*['"]([^'"]+)['"]/m;
      const m = importRe.exec(src);
      expect(m).not.toBeNull();
      // Resolved specifier must match the canonical app.error module.
      // Note: assert against `m?.[0]` (the full match including `from "..."`)
      // because `CANONICAL_IMPORT_RE` expects the `from\s+['"]…['"]` prefix.
      // The capture group `m?.[1]` exposes only the bare URL specifier and
      // would never match the prefix-anchored regex (structurally impossible).
      expect(m?.[0] ?? '').toMatch(CANONICAL_IMPORT_RE);
    });
  });
});
