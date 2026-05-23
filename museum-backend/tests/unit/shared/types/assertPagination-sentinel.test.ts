/**
 * UFR-022 red phase — PR-5 assertPagination sentinel.
 * RUN_ID 2026-05-23-pr-5-assertPagination.
 *
 * Repo-structural assertion (NOT behavior). Locks AC-6 from spec §7:
 * after green sweeps the 7 useCases, the inline pattern must not survive
 * anywhere under `museum-backend/src`, and each migrated useCase must
 * import `assertPagination`.
 *
 * Pre-green: this test FAILS — there are currently 7 inline occurrences of
 * `'page must be a positive integer'` in src (verified via grep 2026-05-23)
 * and the 7 useCases do not import `assertPagination`.
 *
 * Frozen-test discipline: this file is sha256-hashed in `red-test-manifest.json`.
 * Green phase MUST NOT modify it.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '../../../../');
const SRC_ROOT = resolve(REPO_ROOT, 'src');
const HELPER_FILE = resolve(SRC_ROOT, 'shared/types/pagination.ts');

const SEVEN_USECASES: readonly string[] = [
  'src/modules/admin/useCase/users/listUsers.useCase.ts',
  'src/modules/admin/useCase/reports/listReports.useCase.ts',
  'src/modules/admin/useCase/audit/listAuditLogs.useCase.ts',
  'src/modules/support/useCase/ticket-user/listUserTickets.useCase.ts',
  'src/modules/support/useCase/ticket-admin/listAllTickets.useCase.ts',
  'src/modules/review/useCase/admin/listAllReviews.useCase.ts',
  'src/modules/review/useCase/public/listApprovedReviews.useCase.ts',
];

/**
 * Recursively collect every `.ts` file under `dir`, skipping nothing — we
 * want a true repo-wide assertion. Excludes node_modules / dist by virtue
 * of starting from `src/` (which has neither).
 * @param dir
 */
function collectTsFiles(dir: string): string[] {
  // Lazy require to keep top-level imports minimal & to avoid touching this
  // test's import surface if a future refactor swaps the impl.

  const { readdirSync, statSync } = require('node:fs') as typeof import('node:fs');
  const out: string[] = [];
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const full = resolve(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...collectTsFiles(full));
    } else if (st.isFile() && full.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

describe('assertPagination sentinel — wire-format string uniqueness in src', () => {
  it('the literal "page must be a positive integer" appears in exactly one src file (the helper)', () => {
    const allTs = collectTsFiles(SRC_ROOT);
    const hits = allTs.filter((path) => {
      const content = readFileSync(path, 'utf8');
      return content.includes('page must be a positive integer');
    });

    expect(hits).toEqual([HELPER_FILE]);
  });

  it('the literal "limit must be between 1 and 100" appears in exactly one src file (the helper)', () => {
    const allTs = collectTsFiles(SRC_ROOT);
    const hits = allTs.filter((path) => {
      const content = readFileSync(path, 'utf8');
      return content.includes('limit must be between 1 and 100');
    });

    expect(hits).toEqual([HELPER_FILE]);
  });
});

describe('assertPagination sentinel — 7 useCases import the helper', () => {
  it.each(SEVEN_USECASES)(
    '%s imports assertPagination from @shared/types/pagination',
    (relPath) => {
      const absPath = resolve(REPO_ROOT, relPath);
      const content = readFileSync(absPath, 'utf8');

      // Must reference the helper name.
      expect(content).toMatch(/\bassertPagination\b/);

      // Must import it from the canonical module (path alias or relative is
      // accepted; both forms appear in repo). Lock the module specifier.
      const importsHelper =
        /import\s*\{[^}]*\bassertPagination\b[^}]*\}\s*from\s*['"]@shared\/types\/pagination['"]/m.test(
          content,
        ) ||
        /import\s*\{[^}]*\bassertPagination\b[^}]*\}\s*from\s*['"][^'"]*shared\/types\/pagination['"]/m.test(
          content,
        );

      expect(importsHelper).toBe(true);
    },
  );

  it.each(SEVEN_USECASES)(
    '%s no longer contains the inline pattern `!Number.isInteger(...) || ... < 1` paired with badRequest pagination strings',
    (relPath) => {
      const absPath = resolve(REPO_ROOT, relPath);
      const content = readFileSync(absPath, 'utf8');

      // Inline page validator pattern (verbatim from the 7 sites pre-migration).
      // Pattern is intentionally specific to avoid false positives on unrelated
      // integer guards elsewhere in the codebase.
      expect(content).not.toMatch(/!Number\.isInteger\([^)]+\)\s*\|\|\s*[^|]+<\s*1/);

      // Wire-format strings must not appear here either (moved to helper).
      expect(content).not.toContain('page must be a positive integer');
      expect(content).not.toContain('limit must be between 1 and 100');
    },
  );
});
