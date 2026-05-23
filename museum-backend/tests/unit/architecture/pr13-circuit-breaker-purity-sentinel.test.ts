/**
 * UFR-022 red phase — PR-13 circuit-breaker wrapper purity sentinel.
 * RUN_ID: 2026-05-23-pr-13-threeStateCircuit.
 *
 * Repo-structural assertion (filesystem scan, NOT behaviour). Locks the
 * dead-code-burial requirements from spec §3.4 + design.md §6.4 + tasks T8:
 * after the green phase extracts `ThreeStateCircuit<TStrategy>`, the three
 * wrapper files MUST:
 *
 *   1. NOT mutate FSM state directly — no `this.state = ` or `currentState = `
 *      assignment, no private `currentState: CircuitState` field declaration.
 *   2. NOT keep the duplicated `trip(...)` / `transitionTo(...)` private
 *      methods — those moved into the primitive.
 *   3. NOT keep raw `private failures: number[]` / `private hourlyCharges: ` /
 *      `private dailySpend = ` field declarations — these moved into their
 *      respective strategies.
 *   4. Import `ThreeStateCircuit` from `@shared/circuit-breaker/three-state-circuit`.
 *
 * Pre-green: this test FAILS because each wrapper still:
 *   - declares `private currentState: ...CircuitState = 'CLOSED'`
 *   - mutates `this.currentState = 'OPEN' | 'HALF_OPEN' | 'CLOSED'`
 *   - holds a private `trip(now, ...)` / `transitionTo(next)` method
 *   - holds inline failure/charge accumulator fields
 *   - does NOT import from `@shared/circuit-breaker/three-state-circuit`
 *
 * Each forbidden pattern is searched line-by-line so failures cite file:line.
 *
 * Frozen-test discipline (UFR-022): this file is sha256-hashed in
 * red-test-manifest.json. Green phase MUST NOT modify it. Suspected bug →
 * emit `BLOCK-TEST-WRONG <file>:<line> <reason>` and STOP.
 *
 * Spec sources of truth:
 *   .claude/skills/team/team-state/2026-05-23-pr-13-threeStateCircuit/spec.md §3.4 / §7 R2 / §11 AC3-AC5
 *   .claude/skills/team/team-state/2026-05-23-pr-13-threeStateCircuit/design.md §5 / §6.4
 *   .claude/skills/team/team-state/2026-05-23-pr-13-threeStateCircuit/tasks.md T4 / T5 / T6 / T8
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// __dirname = museum-backend/tests/unit/architecture
// ../../..  = museum-backend
const BACKEND_ROOT = resolve(__dirname, '../../..');

const WRAPPER_FILES = [
  'src/modules/chat/adapters/secondary/llm/llm-circuit-breaker.ts',
  'src/modules/chat/adapters/secondary/llm/llm-cost-circuit-breaker.ts',
  'src/modules/chat/adapters/secondary/guardrails/guardrail-circuit-breaker.ts',
] as const;

/**
 * Forbidden patterns in each wrapper file post-refactor. The wrapper delegates
 * FSM mutation to `ThreeStateCircuit`; any direct state-machine plumbing left
 * behind is dead code per UFR-016.
 */
const FORBIDDEN_PATTERNS: readonly { label: string; rx: RegExp }[] = [
  // Direct FSM state mutation — the primitive owns these now.
  {
    label: 'this.currentState assignment (FSM mutation belongs to the primitive)',
    rx: /\bthis\.currentState\s*=\s*['"]/,
  },
  // Raw currentState field declaration (the FSM field moved into the primitive).
  {
    label: 'currentState private field declaration (FSM field belongs to the primitive)',
    rx: /\b(private|protected)\s+currentState\s*:/,
  },
  // Private trip() helper — moved into the primitive (exposed as public trip()).
  {
    label: 'private trip(...) helper (FSM transition logic belongs to the primitive)',
    rx: /\bprivate\s+trip\s*\(/,
  },
  // Private transitionTo() helper — moved into the primitive's internal logic.
  {
    label: 'private transitionTo(...) helper (state transition logic belongs to the primitive)',
    rx: /\bprivate\s+transitionTo\s*\(/,
  },
  // Inline failure/charge accumulator fields — moved into strategies.
  {
    label: 'private failures: number[] field (moved to SlidingWindowFailureStrategy)',
    rx: /\b(private|protected)\s+failures\s*:\s*number\[\]/,
  },
  {
    label: 'private hourlyCharges field (moved to CostTripStrategy)',
    rx: /\b(private|protected)\s+hourlyCharges\s*[:=]/,
  },
  {
    label: 'private dailySpend field (moved to CostTripStrategy)',
    rx: /\b(private|protected)\s+dailySpend\s*[:=]/,
  },
];

/**
 * Required import: post-refactor each wrapper MUST import `ThreeStateCircuit`
 * from the shared primitive. The regex tolerates extra named imports on the
 * same line, single/double quotes, and an optional trailing semicolon.
 */
const PRIMITIVE_IMPORT =
  /import\s*(?:type\s+)?\{[^}]*\bThreeStateCircuit\b[^}]*\}\s*from\s+['"]@shared\/circuit-breaker\/three-state-circuit['"]/;

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
    if (typeof line !== 'string') continue;
    if (rx.test(line)) {
      return { line: i + 1, snippet: line.trim() };
    }
  }
  return null;
}

function readWrapper(rel: string): string {
  return readFileSync(resolve(BACKEND_ROOT, rel), 'utf8');
}

describe('PR-13 sentinel — circuit-breaker wrappers contain no inline FSM state machine', () => {
  describe.each(WRAPPER_FILES)('wrapper %s', (rel) => {
    it.each(FORBIDDEN_PATTERNS)(
      'does not contain the forbidden pattern: $label',
      ({ label, rx }) => {
        const source = readWrapper(rel);
        const match = findFirstMatch(source, rx);
        if (match) {
          throw new Error(
            `PR-13 wrapper-purity violation in ${rel}:${match.line}\n` +
              `  forbidden pattern: ${label}\n` +
              `  offending line   : ${match.snippet}\n` +
              `  remediation      : delegate to ThreeStateCircuit per design.md §5`,
          );
        }
        // Belt-and-braces — second pass against full source guards against
        // line-split edge cases (CRLF, embedded `\r`).
        expect(rx.test(source)).toBe(false);
      },
    );

    it(`imports ThreeStateCircuit from \`@shared/circuit-breaker/three-state-circuit\``, () => {
      const source = readWrapper(rel);
      expect(source).toMatch(PRIMITIVE_IMPORT);
    });
  });
});
