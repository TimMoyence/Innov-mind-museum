/**
 * UFR-022 red phase — PR-14 fetchWithTimeout sweep sentinel.
 * RUN_ID: 2026-05-23-pr-14-fetchWithTimeout.
 *
 * Repo-structural assertion (filesystem scan, NOT behaviour). Locks the
 * sweep-vs-divergence contract from spec §4 + design.md §4 / §5 + tasks T2/T3/T4:
 *
 *   Swept (helper-adopted) — MUST NOT contain inline `setTimeout(…controller.abort…)`
 *   AND MUST import `fetchWithTimeout` from `@shared/http/fetch-with-timeout`:
 *     - src/modules/chat/adapters/secondary/guardrails/presidio.adapter.ts
 *
 *   Divergent (intentionally NOT swept) — MUST carry the literal divergence
 *   comment `does NOT use \`fetchWithTimeout\`` so a future "sweep more" pass
 *   stops, reads the comment, and revisits the spec instead of folding them in:
 *     - src/modules/chat/adapters/secondary/embeddings/replicate.adapter.ts
 *       (multi-fetch shared budget — spec §6 ED-1)
 *     - src/modules/chat/adapters/secondary/embeddings/siglip-onnx.adapter.ts
 *       (signal threaded to `runWithTimeout(session.run, …)`, no fetch — spec §4.2.1)
 *     - src/modules/chat/adapters/secondary/guardrails/llm-guard.adapter.ts
 *       (chaos injection must hold the controller pre-fetch — spec §6 ED-2)
 *
 * Pre-green: this test FAILS because all 5 files still contain the inline
 * `setTimeout(…controller.abort…)` pattern, none of them import
 * `fetchWithTimeout`, and none of the 3 divergence files carry the comment.
 *
 * Each pattern is searched line-by-line so failure messages cite file:line,
 * helping the green editor target the migration precisely.
 *
 * Frozen-test discipline (UFR-022): this file is sha256-hashed in
 * red-test-manifest.json. Green phase MUST NOT modify it. Suspected bug →
 * emit `BLOCK-TEST-WRONG <file>:<line> <reason>` and STOP.
 *
 * Spec sources of truth:
 *   .claude/skills/team/team-state/2026-05-23-pr-14-fetchWithTimeout/spec.md §4 / §6 / §7 AC3-AC5/AC9-AC10
 *   .claude/skills/team/team-state/2026-05-23-pr-14-fetchWithTimeout/design.md §4 / §5 / §6
 *   .claude/skills/team/team-state/2026-05-23-pr-14-fetchWithTimeout/tasks.md T2 / T3 / T4
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// __dirname = museum-backend/tests/unit/architecture
// ../../..  = museum-backend
const BACKEND_ROOT = resolve(__dirname, '../../..');

const SWEPT_FILES = ['src/modules/chat/adapters/secondary/guardrails/presidio.adapter.ts'] as const;

const DIVERGENT_FILES = [
  'src/modules/chat/adapters/secondary/embeddings/replicate.adapter.ts',
  'src/modules/chat/adapters/secondary/embeddings/siglip-onnx.adapter.ts',
  'src/modules/chat/adapters/secondary/guardrails/llm-guard.adapter.ts',
] as const;

/**
 * The inline timer-arm pattern that DRY consolidation removes. Matches both
 * the same-line form `setTimeout(() => controller.abort(), …)` and the
 * multi-line form `setTimeout(() => {\n  controller.abort();\n}, …)`. The
 * `[\s\S]` allows the closure body to span lines.
 */
const INLINE_TIMER_PATTERN = /setTimeout\s*\(\s*\(\s*\)\s*=>\s*\{?[\s\S]{0,80}?controller\.abort/;

/**
 * Required import in swept files: `fetchWithTimeout` named import from the
 * shared module. Tolerates extra named imports on the same line, single/
 * double quotes, and optional trailing semicolon — matches the convention
 * used by every other PR-* sentinel in this folder.
 */
const FETCH_WITH_TIMEOUT_IMPORT =
  /import\s*(?:type\s+)?\{[^}]*\bfetchWithTimeout\b[^}]*\}\s*from\s+['"]@shared\/http\/fetch-with-timeout['"]/;

/**
 * The divergence-comment literal that the 3 NOT-swept files MUST carry. The
 * exact substring is fixed so a future automated "sweep cleanup" cannot
 * accidentally remove it without tripping this sentinel. Backticks are part
 * of the comment payload (they wrap the helper name in markdown style).
 */
const DIVERGENCE_LITERAL = 'does NOT use `fetchWithTimeout`';

function readSource(rel: string): string {
  return readFileSync(resolve(BACKEND_ROOT, rel), 'utf8');
}

/**
 * Returns `{line, snippet}` of the first match against the source, or `null`
 * if no match. Run line-by-line for single-line patterns; for multi-line
 * patterns the caller falls back to a whole-source scan and reports
 * `line: -1`.
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

/**
 * Multi-line scan for the inline timer pattern. Finds the line containing
 * `setTimeout(` and returns it as the offending location, even if the
 * `controller.abort` lives on a subsequent line (multi-line arrow body).
 * @param source
 */
function findInlineTimerLocation(source: string): { line: number; snippet: string } | null {
  // Whole-source first to decide presence.
  if (!INLINE_TIMER_PATTERN.test(source)) return null;
  const setTimeoutLine = findFirstLineMatch(source, /\bsetTimeout\s*\(/);
  if (setTimeoutLine) return setTimeoutLine;
  return { line: -1, snippet: '(multi-line setTimeout closure aborting `controller`)' };
}

describe('PR-14 sentinel — swept adapters delegate to `fetchWithTimeout`', () => {
  describe.each(SWEPT_FILES)('swept file %s', (rel) => {
    it('does NOT contain the inline `setTimeout(... controller.abort ...)` pattern', () => {
      const source = readSource(rel);
      const match = findInlineTimerLocation(source);
      if (match) {
        throw new Error(
          `PR-14 sweep regression in ${rel}:${match.line}\n` +
            `  forbidden pattern: inline setTimeout(...controller.abort...) timer arm\n` +
            `  offending line   : ${match.snippet}\n` +
            `  remediation      : delegate to fetchWithTimeout per design.md §4`,
        );
      }
      // Belt-and-braces full-source assertion guards against any line-split
      // edge case (CRLF, embedded `\r`) the line scan might miss.
      expect(INLINE_TIMER_PATTERN.test(source)).toBe(false);
    });

    it('imports `fetchWithTimeout` from `@shared/http/fetch-with-timeout`', () => {
      const source = readSource(rel);
      expect(source).toMatch(FETCH_WITH_TIMEOUT_IMPORT);
    });
  });
});

describe('PR-14 sentinel — divergent adapters carry the divergence comment', () => {
  it.each(DIVERGENT_FILES)(
    'divergent file %s carries `does NOT use \\`fetchWithTimeout\\`` comment',
    (rel) => {
      const source = readSource(rel);
      if (!source.includes(DIVERGENCE_LITERAL)) {
        throw new Error(
          `PR-14 divergence-comment missing in ${rel}\n` +
            `  required literal substring: ${DIVERGENCE_LITERAL}\n` +
            `  remediation              : add the divergence comment per design.md §5`,
        );
      }
      // Defensive duplicate of the includes-check so the matcher output is
      // diff-friendly when the literal is malformed (e.g. backticks dropped).
      expect(source).toEqual(expect.stringContaining(DIVERGENCE_LITERAL));
    },
  );
});
