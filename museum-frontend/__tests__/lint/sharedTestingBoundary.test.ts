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

const lintFile = (file: string): EslintResult[] => {
  let stdout = '';
  try {
    stdout = execFileSync(
      'npx',
      ['eslint', '--no-error-on-unmatched-pattern', '-f', 'json', file],
      { cwd: PROJECT_ROOT, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch (err) {
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
