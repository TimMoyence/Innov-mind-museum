import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BACKEND_ROOT = resolve(__dirname, '../../..');

const WRAPPER_FILES = [
  'src/modules/chat/adapters/secondary/llm/llm-circuit-breaker.ts',
  'src/modules/chat/adapters/secondary/llm/llm-cost-circuit-breaker.ts',
] as const;

const FORBIDDEN_PATTERNS: readonly { label: string; rx: RegExp }[] = [
  {
    label: 'this.currentState assignment (FSM mutation belongs to the primitive)',
    rx: /\bthis\.currentState\s*=\s*['"]/,
  },
  {
    label: 'currentState private field declaration (FSM field belongs to the primitive)',
    rx: /\b(private|protected)\s+currentState\s*:/,
  },
  {
    label: 'private trip(...) helper (FSM transition logic belongs to the primitive)',
    rx: /\bprivate\s+trip\s*\(/,
  },
  {
    label: 'private transitionTo(...) helper (state transition logic belongs to the primitive)',
    rx: /\bprivate\s+transitionTo\s*\(/,
  },
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

const PRIMITIVE_IMPORT =
  /import\s*(?:type\s+)?\{[^}]*\bThreeStateCircuit\b[^}]*\}\s*from\s+['"]@shared\/circuit-breaker\/three-state-circuit['"]/;

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
        expect(rx.test(source)).toBe(false);
      },
    );

    it(`imports ThreeStateCircuit from \`@shared/circuit-breaker/three-state-circuit\``, () => {
      const source = readWrapper(rel);
      expect(source).toMatch(PRIMITIVE_IMPORT);
    });
  });
});
