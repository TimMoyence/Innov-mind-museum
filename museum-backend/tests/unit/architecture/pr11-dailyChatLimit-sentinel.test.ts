/**
 * UFR-022 red phase — PR-11 dailyChatLimit migration sentinel.
 * RUN_ID: 2026-05-23-pr-11-dailyChatLimit.
 *
 * Repo-structural assertion (filesystem scan, NOT behaviour). Locks the
 * dead-code burial requirements from spec §3.3 + design §3.2 + tasks T5/T7:
 * after the green phase migrates `dailyChatLimit` to a single
 * `createRateLimitMiddleware({...})` call, the source file MUST:
 *
 *   1. NO inline `cache.get(` call (the race-prone read).
 *   2. NO inline `cache.set(` call (the race-prone write).
 *   3. NO declaration of `setDailyChatLimitCacheService` (deprecated wiring
 *      surface — the shared `setRedisRateLimitStore` replaces it).
 *   4. Imports `createRateLimitMiddleware` from `@shared/middleware/rate-limit.middleware`.
 *
 * Pre-green: this test FAILS because the current source still contains:
 *   - daily-chat-limit.middleware.ts:92  `cache.get<number>(key)`
 *   - daily-chat-limit.middleware.ts:109 `cache.set(key, count + 1, ttl)`
 *   - daily-chat-limit.middleware.ts:24  `export const setDailyChatLimitCacheService`
 *   - no `createRateLimitMiddleware` import.
 *
 * Each pattern is searched line-by-line so the failure messages cite the
 * offending file:line, helping the green editor target the migration precisely.
 *
 * Frozen-test discipline (UFR-022): this file is sha256-hashed in
 * red-test-manifest.json. Green phase MUST NOT modify it. Suspected bug →
 * emit `BLOCK-TEST-WRONG <file>:<line> <reason>` and STOP.
 *
 * Spec sources of truth:
 *   .claude/skills/team/team-state/2026-05-23-pr-11-dailyChatLimit/spec.md §3.3 / §4 R3 / §11 AC1
 *   .claude/skills/team/team-state/2026-05-23-pr-11-dailyChatLimit/design.md §3.1 / §3.2 / §5.4
 *   .claude/skills/team/team-state/2026-05-23-pr-11-dailyChatLimit/tasks.md T5 / T7
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// __dirname = museum-backend/tests/unit/architecture
// ../../..  = museum-backend
const BACKEND_ROOT = resolve(__dirname, '../../..');

const TARGET_REL = 'src/shared/middleware/daily-chat-limit.middleware.ts';

/**
 * Forbidden fingerprints in the migrated source. Each entry: regex + label
 * surfaced in the failure message.
 */
const FORBIDDEN_PATTERNS: readonly { label: string; rx: RegExp }[] = [
  // The race-prone read (`cache.get(...)` — the legacy CacheService path).
  // The shared `RedisRateLimitStore.increment` is the SOLE Redis surface
  // post-migration.
  { label: 'cache.get( call (race read-write pattern)', rx: /\bcache\.get\s*[<(]/ },
  // The race-prone write (`cache.set(...)`). Same rationale.
  { label: 'cache.set( call (race read-write pattern)', rx: /\bcache\.set\s*\(/ },
  // Deprecated boot wiring — `setRedisRateLimitStore` replaces this.
  {
    label: 'setDailyChatLimitCacheService declaration (boot wiring removed)',
    rx: /\bsetDailyChatLimitCacheService\b/,
  },
];

/**
 * Required import: post-migration, the module MUST import
 * `createRateLimitMiddleware` from the shared rate-limit module. The regex
 * tolerates extra named imports on the same line, single/double quotes, and
 * an optional trailing semicolon.
 */
const SHARED_FACTORY_IMPORT =
  /import\s*(?:type\s+)?\{[^}]*\bcreateRateLimitMiddleware\b[^}]*\}\s*from\s+['"]@shared\/middleware\/rate-limit\.middleware['"]/;

function readTarget(): string {
  const abs = resolve(BACKEND_ROOT, TARGET_REL);
  return readFileSync(abs, 'utf8');
}

/**
 * Returns `{line, snippet}` of the first match, or `null` if absent. Used to
 * surface the offending file:line in failure messages so the green editor can
 * jump straight to the regression.
 * @param source - full file contents.
 * @param rx - regex tested per line.
 * @returns first match position or null.
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

describe('PR-11 sentinel — daily-chat-limit.middleware.ts contains no race-prone cache pattern or deprecated wiring', () => {
  it.each(FORBIDDEN_PATTERNS)('does not contain the forbidden pattern: $label', ({ label, rx }) => {
    const source = readTarget();
    const match = findFirstMatch(source, rx);
    if (match) {
      throw new Error(
        `PR-11 migration regression in ${TARGET_REL}:${match.line}\n` +
          `  forbidden pattern: ${label}\n` +
          `  offending line   : ${match.snippet}\n` +
          `  remediation      : migrate to createRateLimitMiddleware({...}) per design §3.1`,
      );
    }
    // Belt-and-braces — second pass against the full source guards against
    // any line-split edge case (CRLF, embedded `\r`).
    expect(rx.test(source)).toBe(false);
  });
});

describe('PR-11 sentinel — daily-chat-limit.middleware.ts imports the shared rate-limit factory', () => {
  it(`imports createRateLimitMiddleware from \`@shared/middleware/rate-limit.middleware\``, () => {
    const source = readTarget();
    expect(source).toMatch(SHARED_FACTORY_IMPORT);
  });
});
