import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const BACKEND_ROOT = resolve(__dirname, '../../..');
const FIXTURE_DIR = resolve(BACKEND_ROOT, 'tests/fixtures/architecture');
const RUNNER = resolve(FIXTURE_DIR, 'lint-fixture-runner.mjs');

interface RunnerResult {
  fixture: string;
  boundariesErrors: number;
  fatals: string[];
}

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
