/**
 * C9.17 (2026-05-18) — Step A sentinel asserting that NO test fake under
 * `museum-backend/tests/unit/chat/**` fabricates the legacy `text + [META] {json}`
 * wire format. Pre-condition for the parser sunset (UFR-016 "il est mort on
 * l'enterre").
 *
 * Background — the chat orchestrator carried two coexisting output paths:
 *   1. Structured-output fast path: `model.withStructuredOutput(schema).invoke()`.
 *   2. Legacy plain-text + `[META] {json}` tail path parsed by
 *      `parseAssistantResponse`.
 * Production has used (1) since the C2 fix in May 2026. Step A migrates all
 * test fakes off the legacy format so Step B can hard-delete the parser.
 *
 * This file is the RED test that drives Step A. It walks every `.ts` file in
 * `tests/unit/chat/` (excluding itself), reads the source text, and asserts
 * the literal substring `[META]` is absent — AFTER stripping permitted
 * occurrences inside `.not.toContain('[META]')` / `.not.toMatch('[META]')`
 * style assertions (which prove ABSENCE, not introduction).
 *
 * Refs:
 *   - spec.md  → .claude/skills/team/team-state/2026-05-18-w1-c9-17-sunset-meta-parser/spec.md (§4 R8, §5.2, §7 A1)
 *   - design.md → .claude/skills/team/team-state/2026-05-18-w1-c9-17-sunset-meta-parser/design.md (§4 Step A)
 *   - tasks.md  → .claude/skills/team/team-state/2026-05-18-w1-c9-17-sunset-meta-parser/tasks.md (T1.1)
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const TEST_DIR = __dirname; // museum-backend/tests/unit/chat
const SELF = '_legacy-meta-sentinel.test.ts';
const FORBIDDEN_LITERAL = '[META]';

/**
 * Lines that PROVE the absence of `[META]` (jest assertions that the literal
 * is NOT contained / NOT matched) are permitted. Stripping them before the
 * forbidden-literal scan prevents the sentinel from flagging its own
 * regression guards.
 *
 * Matches:
 *   - `.not.toContain('[META]')` / `.not.toContain("[META]")`
 *   - `.not.toMatch('[META]')`  / `.not.toMatch("[META]")`
 *   - `.not.toMatch(/\[META\]/)`  (regex literal form)
 * The patterns are deliberately tight — only `[META]` between matching
 * quotes/slashes, no arbitrary substrings.
 */
const PERMITTED_ASSERTION_LINE = new RegExp(
  String.raw`\.not\.(?:toContain|toMatch)\(\s*(?:` +
    String.raw`'\[META\]'|` + // single-quoted string
    String.raw`"\[META\]"|` + // double-quoted string
    String.raw`/\\?\[META\\?\]/` + // regex literal (with or without backslash escapes)
    String.raw`)\s*\)`,
  'g',
);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
      continue;
    }
    if (!name.endsWith('.ts')) continue;
    if (full === join(TEST_DIR, SELF)) continue;
    out.push(full);
  }
  return out;
}

function scrub(content: string): string {
  return content.replace(PERMITTED_ASSERTION_LINE, '');
}

describe('C9.17 — legacy [META] sentinel (Step A)', () => {
  it('no test file in tests/unit/chat fabricates the legacy [META] wire format', () => {
    const files = walk(TEST_DIR);
    const offenders = files
      .filter((f) => {
        const scrubbed = scrub(readFileSync(f, 'utf8'));
        return scrubbed.includes(FORBIDDEN_LITERAL);
      })
      .map((f) => relative(TEST_DIR, f))
      .sort();

    // Surface an informative failure listing offending paths BEFORE the
    // structural toEqual fires (whose diff for long lists can be noisy).
    if (offenders.length > 0) {
      throw new Error(
        `C9.17 sentinel — ${offenders.length} file(s) still emit the legacy ` +
          `[META] wire format:\n  - ${offenders.join('\n  - ')}\n` +
          `Migrate each fake to return structured output (see tasks.md T1.2).`,
      );
    }
    // Structural assertion (single source of truth for the post-condition).
    expect(offenders).toEqual([]);
  });
});
