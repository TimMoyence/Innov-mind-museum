/**
 * RED phase — fixture-guard proving the hexagonal `boundaries/dependencies` rule
 * actually BITES (run 2026-06-04-hexagonal-boundaries-enforcement, T1.1; spec R2,
 * acceptance §9.1-§9.2; design.md §8).
 *
 * Background (spec §1): the boundaries config block (`eslint.config.mjs:64-160`)
 * is a proven NO-OP — its `settings` has no `import/resolver`, so the v6 plugin
 * resolves every `@modules/*`/`@shared/*`/`@data/*` alias as `external` (path
 * `null`), classifies no file into an element type, and the `from: { type:
 * 'domain' }` rule never matches. The inline comment claiming enforcement was
 * "restored" is false.
 *
 * This guard lints two committed fixtures through the **real** `eslint.config.mjs`
 * boundaries block via the ESLint Node API:
 *   - `violating-domain.fixture.ts` — a domain-shaped file importing a secondary
 *     adapter (`infrastructure`). MUST produce ≥1 `boundaries/dependencies` error.
 *   - `clean-domain.fixture.ts` — imports only the domain layer. MUST produce 0.
 *
 * RED failure mode (TODAY): with no resolver, the violating fixture yields 0
 * `boundaries/dependencies` errors → the `expect(violatingErrors).toBeGreaterThanOrEqual(1)`
 * assertion FAILS. That non-zero `pnpm test` exit IS the success of this RED phase.
 * It turns GREEN after T1.3 wires `import/resolver` into the boundaries block.
 *
 * Mechanism (verified empirically in RED): the test imports the REAL config array,
 * extracts the single block that registers the boundaries plugin (so the resolver,
 * once wired, is co-verified live), and lints the fixture CONTENT at a virtual
 * domain path (under a synthetic module's domain dir) so the boundaries domain
 * element pattern classifies it as the domain layer. A non-type-aware TypeScript
 * parser is supplied for that virtual path (the boundaries rule needs no type
 * information; the real config projectService parser would reject the non-existent
 * virtual file). No other rule is applied — this isolates the boundaries behaviour
 * and keeps the fixtures OUT of the production lint scope (design.md section 8). NO
 * eslint-disable is used to fake the violation.
 *
 * Frozen-test discipline (UFR-022): sha256-hashed in red-test-manifest.json; the
 * green phase MUST NOT modify it byte-for-byte. Suspected bug → emit
 * `BLOCK-TEST-WRONG <file>:<line> <reason>` and STOP.
 *
 * Spec sources of truth:
 *   .claude/skills/team/team-state/2026-06-04-hexagonal-boundaries-enforcement/spec.md §3 R1/R2 / §9.1-§9.2
 *   .claude/skills/team/team-state/2026-06-04-hexagonal-boundaries-enforcement/design.md §4 / §8
 *   .claude/skills/team/team-state/2026-06-04-hexagonal-boundaries-enforcement/tasks.md T1.1
 */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

// tests/unit/architecture → museum-backend
const BACKEND_ROOT = resolve(__dirname, '../../..');
const FIXTURE_DIR = resolve(BACKEND_ROOT, 'tests/fixtures/architecture');
const RUNNER = resolve(FIXTURE_DIR, 'lint-fixture-runner.mjs');

interface RunnerResult {
  fixture: string;
  boundariesErrors: number;
  fatals: string[];
}

/**
 * Spawns the native-ESM `lint-fixture-runner.mjs` (which loads the REAL
 * `eslint.config.mjs` boundaries block — co-verifying the resolver once T1.3
 * wires it) against a fixture and returns the parsed count of
 * `boundaries/dependencies` errors.
 *
 * A child process is required because the Jest `unit-integration` project runs
 * without `--experimental-vm-modules`, so this test cannot itself dynamic-import
 * the ESM flat config (`A dynamic import callback was invoked without
 * --experimental-vm-modules`). The runner runs in native ESM and prints a JSON
 * line. Any fatal lint message is surfaced as a thrown error so a parser/config
 * regression never silently masquerades as "0 violations".
 * @param fixtureFile - file name under tests/fixtures/architecture
 * @returns the `boundaries/dependencies` error count for that fixture
 */
function countBoundariesErrors(fixtureFile: string): number {
  const fixturePath = resolve(FIXTURE_DIR, fixtureFile);
  const stdout = execFileSync('node', [RUNNER, fixturePath], {
    cwd: BACKEND_ROOT,
    encoding: 'utf8',
  });
  const parsed = JSON.parse(stdout.trim()) as RunnerResult;

  if (parsed.fatals.length > 0) {
    throw new Error(
      `boundaries-rule-bites: fatal lint message(s) for ${fixtureFile} — ${parsed.fatals.join(' | ')}`,
    );
  }

  return parsed.boundariesErrors;
}

describe('boundaries rule bites — fixture-guard (R2)', () => {
  it('reports ≥1 boundaries/dependencies error for the domain→adapter violating fixture', () => {
    const violatingErrors = countBoundariesErrors('violating-domain.fixture.ts');
    expect(violatingErrors).toBeGreaterThanOrEqual(1);
  });

  it('reports 0 boundaries/dependencies errors for the clean intra-domain fixture', () => {
    const cleanErrors = countBoundariesErrors('clean-domain.fixture.ts');
    expect(cleanErrors).toBe(0);
  });
});
