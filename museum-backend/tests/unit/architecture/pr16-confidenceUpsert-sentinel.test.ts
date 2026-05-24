/**
 * UFR-022 red phase — PR-16 confidenceUpsert sweep sentinel.
 * RUN_ID: 2026-05-23-pr-16-confidenceUpsert.
 *
 * Repo-structural assertion (filesystem scan, NOT behaviour). Locks the
 * sweep-vs-dedup contract from spec §2 / R2.1-R2.3 + design.md §3 + tasks
 * T2/T3:
 *
 *   Swept (helper-adopted) repos — MUST NOT contain the inline confidence
 *   branch `data.confidence > existing.confidence` (that algorithm now lives in
 *   the shared helper, never reinlined — UFR-016 anti-regression) AND MUST
 *   import `confidenceUpsert` from `@shared/db/confidence-upsert`:
 *     - src/modules/knowledge-extraction/adapters/secondary/pg/typeorm-artwork-knowledge.repo.ts
 *     - src/modules/knowledge-extraction/adapters/secondary/pg/typeorm-museum-enrichment.repo.ts
 *
 * Pre-green: this test FAILS because both repos still contain the inline
 * `if (data.confidence > existing.confidence)` branch and neither imports
 * `confidenceUpsert`.
 *
 * Each pattern is searched line-by-line so failure messages cite file:line,
 * helping the green editor target the migration precisely.
 *
 * Frozen-test discipline (UFR-022): this file is sha256-hashed in
 * red-test-manifest.json. Green phase MUST NOT modify it. Suspected test bug →
 * emit `BLOCK-TEST-WRONG <file>:<line> <reason>` and STOP.
 *
 * libDocsConsulted: ["typeorm"] — lib-docs/typeorm/PATTERNS.md §3.1 (Data-Mapper
 * `repo.save(entity)` stays in the repo; only the merge moves to the helper).
 *
 * Spec sources of truth:
 *   .claude/skills/team/team-state/2026-05-23-pr-16-confidenceUpsert/spec.md §2 / R2 / §6
 *   .claude/skills/team/team-state/2026-05-23-pr-16-confidenceUpsert/design.md §3 / §6
 *   .claude/skills/team/team-state/2026-05-23-pr-16-confidenceUpsert/tasks.md T2 / T3 / T5
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// __dirname = museum-backend/tests/unit/architecture
// ../../..  = museum-backend
const BACKEND_ROOT = resolve(__dirname, '../../..');

const SWEPT_REPOS = [
  'src/modules/knowledge-extraction/adapters/secondary/pg/typeorm-artwork-knowledge.repo.ts',
  'src/modules/knowledge-extraction/adapters/secondary/pg/typeorm-museum-enrichment.repo.ts',
] as const;

/**
 * The inline confidence branch that DRY consolidation removes. Matches the
 * literal comparison `data.confidence > existing.confidence` regardless of the
 * surrounding `if (` and whitespace. Once delegated, this comparison lives
 * ONLY inside `src/shared/db/confidence-upsert.ts` (excluded from this scan).
 */
const INLINE_CONFIDENCE_BRANCH = /data\.confidence\s*>\s*existing\.confidence/;

/**
 * Required import in swept repos: `confidenceUpsert` named import from the
 * shared module. Tolerates extra named imports on the same line, single/double
 * quotes, optional `type` keyword, and optional trailing semicolon — matches
 * the convention used by every other PR-* sentinel in this folder.
 */
const CONFIDENCE_UPSERT_IMPORT =
  /import\s*(?:type\s+)?\{[^}]*\bconfidenceUpsert\b[^}]*\}\s*from\s+['"]@shared\/db\/confidence-upsert['"]/;

function readSource(rel: string): string {
  return readFileSync(resolve(BACKEND_ROOT, rel), 'utf8');
}

/**
 * Returns `{line, snippet}` of the first match against the source, or `null`
 * if no match. Run line-by-line so failure messages can cite file:line.
 * @param source - full file contents.
 * @param rx - regex tested per line.
 */
function findFirstLineMatch(source: string, rx: RegExp): { line: number; snippet: string } | null {
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (typeof line !== 'string') continue;
    if (rx.test(line)) {
      return { line: i + 1, snippet: line.trim() };
    }
  }
  return null;
}

describe('PR-16 sentinel — swept repos delegate confidence merge to `confidenceUpsert`', () => {
  describe.each(SWEPT_REPOS)('swept repo %s', (rel) => {
    it('does NOT contain the inline `data.confidence > existing.confidence` branch', () => {
      const source = readSource(rel);
      const match = findFirstLineMatch(source, INLINE_CONFIDENCE_BRANCH);
      if (match) {
        throw new Error(
          `PR-16 sweep regression in ${rel}:${match.line}\n` +
            `  forbidden pattern: inline data.confidence > existing.confidence merge branch\n` +
            `  offending line   : ${match.snippet}\n` +
            `  remediation      : delegate to confidenceUpsert per design.md §3`,
        );
      }
      // Belt-and-braces full-source assertion guards against any line-split
      // edge case (CRLF, embedded `\r`) the line scan might miss.
      expect(INLINE_CONFIDENCE_BRANCH.test(source)).toBe(false);
    });

    it('imports `confidenceUpsert` from `@shared/db/confidence-upsert`', () => {
      const source = readSource(rel);
      expect(source).toMatch(CONFIDENCE_UPSERT_IMPORT);
    });
  });
});
