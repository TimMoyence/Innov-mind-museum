/**
 * UFR-022 red phase — PR-10 probabilistic-refresh sweep sentinel.
 * RUN_ID: 2026-05-23-pr-10-probabilistic-refresh.
 *
 * Repo-structural assertion (filesystem scan, NOT behaviour). Locks acceptance
 * A2/A3 from spec §6 + design §1.4 / §1.6: after the green phase delegates
 * Overpass + Nominatim cache helpers to `@shared/cache/probabilistic-refresh`,
 * neither `museum-backend/src/shared/http/overpass-cache.ts` nor
 * `museum-backend/src/shared/http/nominatim.client.ts` may contain the
 * algorithmic fingerprint locally:
 *
 *   1. NO inline `Math.random()` call (the helper is the single site).
 *   2. NO `EARLY_REFRESH_THRESHOLD` constant declaration / usage (delegated
 *      to `EARLY_REFRESH_THRESHOLD_DEFAULT` inside the shared helper).
 *   3. NO `elapsed`-vs-`ttl` ratio derivation (`elapsedMs / ttlMs` or
 *      `(now - storedAtMs) * 1_000`-style math).
 *
 * Pre-green: this test FAILS — current sources still contain:
 *   - overpass-cache.ts:21 `const EARLY_REFRESH_THRESHOLD = 0.9`,
 *   - overpass-cache.ts:88 `const elapsedRatio = elapsedMs / ttlMs`,
 *   - overpass-cache.ts:92 `Math.random() < (elapsedRatio - EARLY_REFRESH_THRESHOLD) / …`,
 *   - nominatim.client.ts:332-339 mirror of the same algorithm,
 *   - nominatim.client.ts:339 `Math.random() < (elapsedRatio - EARLY_REFRESH_THRESHOLD) / …`.
 *
 * Each pattern is searched line-by-line so the failure messages cite the
 * offending file:line, helping the green editor target the sweep precisely.
 *
 * Frozen-test discipline (UFR-022): this file is sha256-hashed in
 * red-test-manifest.json. Green phase MUST NOT modify it. Suspected bug →
 * emit `BLOCK-TEST-WRONG <file>:<line> <reason>`, do NOT touch.
 *
 * Spec sources of truth:
 *   .claude/skills/team/team-state/2026-05-23-pr-10-probabilistic-refresh/spec.md §3.1 / §6 A2-A3 / §6 A8
 *   .claude/skills/team/team-state/2026-05-23-pr-10-probabilistic-refresh/design.md §1.4 / §1.6 / §2
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// __dirname = museum-backend/tests/unit/architecture
// ../../..  = museum-backend
const BACKEND_ROOT = resolve(__dirname, '../../..');

/**
 * The 2 PR-10 sweep targets (spec §3.1 sites A and B). Paths are relative to
 * museum-backend/ so assertions are portable across worktrees.
 */
const TARGETS: readonly string[] = [
  'src/shared/http/overpass-cache.ts',
  'src/shared/http/nominatim.client.ts',
];

/**
 * Fingerprints we forbid in sweep targets. Each entry has a regex + a label
 * used in failure messages. Patterns are intentionally narrow to avoid false
 * positives on unrelated arithmetic.
 */
const FORBIDDEN_PATTERNS: readonly { label: string; rx: RegExp }[] = [
  // Forbids the literal `Math.random(` call — the shared helper is the SOLE
  // emitter of the TTL-jitter random roll.
  { label: 'Math.random() call (TTL-jitter formula)', rx: /\bMath\.random\s*\(/ },
  // Forbids redeclaration of the EARLY_REFRESH_THRESHOLD constant inside the
  // sweep targets. The shared helper exposes `EARLY_REFRESH_THRESHOLD_DEFAULT`
  // for callers that need to reference the value (none do today).
  { label: 'EARLY_REFRESH_THRESHOLD identifier', rx: /\bEARLY_REFRESH_THRESHOLD\b/ },
  // Forbids the elapsed/ttl ratio derivation — the algorithmic kernel of the
  // probabilistic-refresh formula. Anchored on `elapsedRatio` because that is
  // the verbatim identifier used in both pre-sweep sites.
  { label: 'elapsedRatio = elapsedMs / ttlMs derivation', rx: /\belapsedRatio\b/ },
];

/**
 * Required import line: after the sweep, both targets MUST import from the new
 * shared module. The regex tolerates extra named imports on the same line,
 * single or double quotes, and optional trailing semicolon.
 */
const SHARED_HELPER_IMPORT =
  /import\s*(?:type\s+)?\{[^}]*\b(?:shouldEarlyRefresh|createBackgroundRefresh|RefreshableEntry)\b[^}]*\}\s*from\s+['"]@shared\/cache\/probabilistic-refresh['"]/;

function readTarget(relPath: string): string {
  const abs = resolve(BACKEND_ROOT, relPath);
  return readFileSync(abs, 'utf8');
}

/**
 * Returns `{line, snippet}` of the first match, or `null` if absent. Used to
 * surface the offending file:line in failure messages so the green editor can
 * jump straight to the regression.
 * @param source
 * @param rx
 */
function findFirstMatch(source: string, rx: RegExp): { line: number; snippet: string } | null {
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    if (rx.test(line)) {
      return { line: i + 1, snippet: line.trim() };
    }
  }
  return null;
}

describe('PR-10 sentinel — sweep targets contain no probabilistic-refresh algorithm fingerprint', () => {
  describe.each(TARGETS)('%s', (relPath) => {
    it.each(FORBIDDEN_PATTERNS)(
      'does not contain the forbidden pattern: $label',
      ({ label, rx }) => {
        const source = readTarget(relPath);
        const match = findFirstMatch(source, rx);
        if (match) {
          throw new Error(
            `PR-10 sweep regression in ${relPath}:${match.line}\n` +
              `  forbidden pattern: ${label}\n` +
              `  offending line   : ${match.snippet}\n` +
              `  remediation      : delegate to @shared/cache/probabilistic-refresh`,
          );
        }
        // Belt-and-braces — if findFirstMatch returns null the regex must not
        // match the full source either. Cheap second pass to harden against
        // any line-split edge case (CRLF, embedded `\r`).
        expect(rx.test(source)).toBe(false);
      },
    );
  });
});

describe('PR-10 sentinel — sweep targets import from the shared helper', () => {
  it.each(TARGETS)(
    '%s imports at least one symbol from `@shared/cache/probabilistic-refresh`',
    (relPath) => {
      const source = readTarget(relPath);
      expect(source).toMatch(SHARED_HELPER_IMPORT);
    },
  );
});
