/**
 * RED (W1-L1-17) — ESLint `no-restricted-imports` boundary: `app/**` MUST NOT
 * import `@/shared/testing/*` (test-only harness), but `__tests__/**` may (spec R7).
 *
 * Runs the project's REAL flat config (`eslint.config.mjs`) over two temp fixtures
 * written under `app/` and `__tests__/`. ESLint is invoked in a child process (its
 * flat config is ESM and cannot be dynamically imported inside Jest's CJS VM) with
 * `-f json`, and the parsed result is asserted: the app fixture reports a
 * `no-restricted-imports` error; the test fixture does not.
 *
 * Fails RED because the boundary rule is not yet present in `eslint.config.mjs`,
 * so the app fixture produces NO error.
 *
 * Does NOT touch any real source file — fixtures are temp files removed on teardown.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const PROJECT_ROOT = resolve(__dirname, '..', '..');

const FIXTURE_SOURCE = [
  "import { withNetworkSim } from '@/shared/testing/withNetworkSim';",
  '',
  'export const x = withNetworkSim;',
  '',
].join('\n');

interface EslintMessage {
  ruleId: string | null;
}
interface EslintResult {
  messages: EslintMessage[];
}

const writeFixture = (relativeDir: string, name: string): { dir: string; file: string } => {
  const dir = mkdtempSync(join(PROJECT_ROOT, relativeDir, '.boundary-fixture-'));
  const file = join(dir, name);
  writeFileSync(file, FIXTURE_SOURCE, 'utf-8');
  return { dir, file };
};

/** Lints a single file with the project's real flat config; returns parsed JSON results. */
const lintFile = (file: string): EslintResult[] => {
  let stdout = '';
  try {
    stdout = execFileSync(
      'npx',
      ['eslint', '--no-error-on-unmatched-pattern', '-f', 'json', file],
      { cwd: PROJECT_ROOT, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch (err) {
    // ESLint exits non-zero when it reports lint errors; the JSON report is still
    // on stdout. Re-read it from the thrown error object.
    const e = err as { stdout?: string };
    stdout = e.stdout ?? '';
  }
  return JSON.parse(stdout) as EslintResult[];
};

const hasRestrictedImport = (results: EslintResult[]): boolean =>
  results.some((r) => r.messages.some((m) => m.ruleId === 'no-restricted-imports'));

describe('shared/testing import boundary (ESLint no-restricted-imports)', () => {
  let appFixture: { dir: string; file: string } | null = null;
  let testFixture: { dir: string; file: string } | null = null;

  afterEach(() => {
    if (appFixture) rmSync(appFixture.dir, { recursive: true, force: true });
    if (testFixture) rmSync(testFixture.dir, { recursive: true, force: true });
    appFixture = null;
    testFixture = null;
  });

  it('flags an app/ file importing @/shared/testing/*', () => {
    appFixture = writeFixture('app', 'boundary-violation.tsx');

    const results = lintFile(appFixture.file);

    expect(hasRestrictedImport(results)).toBe(true);
  });

  it('allows a __tests__/ file to import @/shared/testing/*', () => {
    testFixture = writeFixture('__tests__', 'boundary-allowed.test.ts');

    const results = lintFile(testFixture.file);

    expect(hasRestrictedImport(results)).toBe(false);
  });
});
