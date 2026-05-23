/**
 * UFR-022 red phase — PR-8 paginate sweep sentinel.
 * RUN_ID: 2026-05-23-pr-8-paginate.
 *
 * Repo-structural assertion (filesystem scan, NOT behaviour). Locks AC2/AC5
 * from spec §7 + design DL-3:
 *   1. After green sweeps S1–S4, the 2 enumerated repository files contain
 *      ZERO inline offset-pagination assembly (`.getManyAndCount(` or
 *      `.skip(...).take(...).getMany(`).
 *   2. Each of the 2 files imports `paginate` from
 *      `@shared/pagination/offset-paginate`.
 *
 * Pre-green: this test FAILS — the current repo state has:
 *   - 3 `.getManyAndCount()` call sites in admin.repository.pg.ts (S1/S2/S3,
 *     verified Read 2026-05-23 at lines 122, 227, 313).
 *   - 1 `.skip(offset).take(limit).getMany()` chain in review.repository.pg.ts
 *     (S4, line 65), with `getCount()` line 63 — 2 round-trips.
 *   - ZERO `import` of `@shared/pagination/offset-paginate` in either file
 *     (helper module does not exist yet).
 *
 * Out of scope per design.md DL-1/DL-2: S5 (`support.repository.pg.ts`) kept
 * inline due to `getRawAndEntities` + subquery path. Sentinel scope is the
 * 2 swept files only.
 *
 * Spec sources of truth:
 *   .claude/skills/team/team-state/2026-05-23-pr-8-paginate/spec.md §4 R2
 *                                                              §4 R6 (sentinel),
 *                                                              §7 A2/A5.
 *   .claude/skills/team/team-state/2026-05-23-pr-8-paginate/design.md §3 (per-site),
 *                                                                §4.2 (sentinel),
 *                                                                DL-1/DL-2.
 *
 * Frozen-test discipline (UFR-022): this file is sha256-hashed in
 * `red-test-manifest.json`. Green phase MUST NOT modify it. Suspected bug →
 * emit `BLOCK-TEST-WRONG <file>:<line> <reason>`, do NOT touch.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// __dirname = museum-backend/tests/unit/architecture
// ../../..  = museum-backend
const BACKEND_ROOT = resolve(__dirname, '../../..');

/**
 * The 2 repository files swept by PR-8 (4 sites total: 3 in admin, 1 in review).
 * Paths are relative to museum-backend/ so the assertion is portable across
 * worktrees.
 *
 * Site map (spec §4 R2, design §3):
 *   - admin.repository.pg.ts: S1 listUsers (was line ~122),
 *                             S2 listAuditLogs (was line ~227),
 *                             S3 listReports (was line ~313).
 *   - review.repository.pg.ts: S4 listReviews (was lines 63 + 65, 2 round-trips).
 */
const SWEPT_FILES: readonly string[] = [
  'src/modules/admin/adapters/secondary/pg/admin.repository.pg.ts',
  'src/modules/review/adapters/secondary/pg/review.repository.pg.ts',
];

describe('PR-8 sentinel — swept repositories use the paginate helper exclusively', () => {
  it.each(SWEPT_FILES)(
    '%s contains NO inline `.getManyAndCount(` call (replaced by paginate(...))',
    (relPath) => {
      const absPath = resolve(BACKEND_ROOT, relPath);
      const content = readFileSync(absPath, 'utf8');

      // Direct token presence. After sweep, the 3 admin sites + 0 review sites
      // currently emitting this token MUST be migrated to `paginate(...)`.
      // S5 (support.repository.pg.ts) uses `getRawAndEntities`, not
      // `getManyAndCount`, and is NOT in SWEPT_FILES per design DL-1/DL-2.
      expect(content).not.toMatch(/\.getManyAndCount\(/);
    },
  );

  it.each(SWEPT_FILES)(
    '%s contains NO inline `.skip(...).take(...).getMany(` chain (S4 convergence)',
    (relPath) => {
      const absPath = resolve(BACKEND_ROOT, relPath);
      const content = readFileSync(absPath, 'utf8');

      // S4 review.repository.pg.ts currently does:
      //   qb.orderBy('r.createdAt', 'DESC').skip(offset).take(limit).getMany()
      // Tolerant on whitespace and newlines between method calls (the chain
      // may span multiple lines). `[\s\S]` matches any char including
      // newline; bounded by `.skip(` and `.getMany(` so it does not
      // accidentally catch `.getManyAndCount(` (already covered above).
      //
      // Match: `.skip(` ... `.take(` ... `.getMany(` (NOT followed by `AndCount`)
      // The `(?!AndCount)` lookahead distinguishes `getMany(` from
      // `getManyAndCount(`.
      expect(content).not.toMatch(/\.skip\([\s\S]*?\.take\([\s\S]*?\.getMany\((?!AndCount)/);
    },
  );

  it.each(SWEPT_FILES)(
    '%s imports `paginate` from `@shared/pagination/offset-paginate`',
    (relPath) => {
      const absPath = resolve(BACKEND_ROOT, relPath);
      const content = readFileSync(absPath, 'utf8');

      // Tolerant import-statement match:
      //   - `import { paginate } from '@shared/pagination/offset-paginate';`
      //   - `import { paginate, … } from '@shared/pagination/offset-paginate';`
      //   - `import { …, paginate } from '@shared/pagination/offset-paginate';`
      //   - single or double quotes around the module specifier.
      // The regex requires `paginate` to be present in the named-imports list
      // AND the specifier to end with `offset-paginate` (allowing for the
      // `@shared/pagination/` alias prefix).
      expect(content).toMatch(
        /import\s*\{[^}]*\bpaginate\b[^}]*\}\s*from\s*['"]@shared\/pagination\/offset-paginate['"]/,
      );
    },
  );
});
