/**
 * PR-6 Dead Code Burial sentinel (UFR-016 "il est mort on l'enterre")
 * ----------------------------------------------------------------------------
 * RUN_ID: 2026-05-23-pr-6-dead-code-burial
 *
 * UFR-022 red phase: this sentinel codifies the burial contract on disk. It
 * fails PRE-green (because the dead files still exist) and passes POST-green
 * (after the 4 files are deleted), then continues to fail any future commit
 * that re-introduces them or re-imports their symbols.
 *
 * Asserts five things, all grep-based / fs-based — no runtime import of the
 * dead modules (an import would defeat the sentinel by recreating a consumer):
 *
 *   1. `museum-backend/src/shared/http/http-cache-headers.ts`        absent
 *   2. `museum-backend/src/shared/audit/audit-chain-verifier.ts`     absent
 *   3. `museum-backend/tests/unit/helpers/http-cache-headers.test.ts` absent
 *   4. `museum-backend/tests/unit/shared/audit/audit-chain-verifier.test.ts`
 *      absent
 *   5. No import grep-able for `http-cache-headers` or `audit-chain-verifier`
 *      anywhere under `museum-backend/src/`.
 *
 * Spec source of truth:
 *   .claude/skills/team/team-state/2026-05-23-pr-6-dead-code-burial/spec.md
 *   §4.2 (T2) and §4.3 (T3) + §5 summary table + §6 R2/R3 + §8 AC3/AC6.
 *
 * The T1 target (`isSentryEnabled`) is intentionally NOT asserted here —
 * spec §4.1 scoped it OUT (legitimate test-only public observable).
 */

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
//   __dirname = museum-backend/tests/unit/architecture
//   ../../..  = museum-backend
const BACKEND_ROOT = path.resolve(__dirname, '../../..');
const SRC_DIR = path.join(BACKEND_ROOT, 'src');

const DEAD_SRC_FILES: readonly string[] = [
  path.join(BACKEND_ROOT, 'src/shared/http/http-cache-headers.ts'),
  path.join(BACKEND_ROOT, 'src/shared/audit/audit-chain-verifier.ts'),
];

const DEAD_TEST_FILES: readonly string[] = [
  path.join(BACKEND_ROOT, 'tests/unit/helpers/http-cache-headers.test.ts'),
  path.join(BACKEND_ROOT, 'tests/unit/shared/audit/audit-chain-verifier.test.ts'),
];

// Symbols whose presence under src/ would mean a consumer still exists.
// We grep on the filename stems (slug form). Import statements always use one
// of these two slugs whether via relative path or path alias:
//   import { httpCacheHeaders } from '@shared/http/http-cache-headers';
//   import { verifyAuditChain } from '@shared/audit/audit-chain-verifier';
//   import { verifyAuditChain } from '../audit/audit-chain-verifier';
const FORBIDDEN_IMPORT_SLUGS: readonly string[] = ['http-cache-headers', 'audit-chain-verifier'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Run `grep -rn '<pattern>' <dir>` and return matching lines (excluding lines
 * inside this very sentinel file, which obviously mentions the slugs by name).
 * Exit code 1 (no match) is success — we surface 0 lines, not an exception.
 * @param pattern
 */
function grepSrc(pattern: string): string[] {
  let stdout: string;
  try {
    stdout = execSync(
      `grep -rn --include='*.ts' ${JSON.stringify(pattern)} ${JSON.stringify(SRC_DIR)}`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
  } catch (err) {
    // grep exits 1 when no match → execSync throws. Treat as empty.
    const status = (err as { status?: number }).status;
    if (status === 1) return [];
    throw err;
  }
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

describe('PR-6 dead code burial sentinel (UFR-016)', () => {
  describe.each(DEAD_SRC_FILES)('src file is buried: %s', (absPath) => {
    it('does not exist on disk', () => {
      expect({
        file: path.relative(BACKEND_ROOT, absPath),
        exists: existsSync(absPath),
      }).toEqual({
        file: path.relative(BACKEND_ROOT, absPath),
        exists: false,
      });
    });
  });

  describe.each(DEAD_TEST_FILES)('test file is buried: %s', (absPath) => {
    it('does not exist on disk', () => {
      expect({
        file: path.relative(BACKEND_ROOT, absPath),
        exists: existsSync(absPath),
      }).toEqual({
        file: path.relative(BACKEND_ROOT, absPath),
        exists: false,
      });
    });
  });

  describe.each(FORBIDDEN_IMPORT_SLUGS)('no remaining importer in src/ for slug "%s"', (slug) => {
    it('grep -rn returns zero matches under museum-backend/src', () => {
      const hits = grepSrc(slug);
      // Helpful diagnostic when this fails: show every offending line so
      // the green phase knows exactly what still needs cleanup.
      expect({ slug, hits }).toEqual({ slug, hits: [] });
    });
  });
});
