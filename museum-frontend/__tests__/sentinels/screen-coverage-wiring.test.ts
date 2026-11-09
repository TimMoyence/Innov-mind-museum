import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(__dirname, '..', '..', '..');

const SENTINEL_REF = 'screen-test-coverage.mjs';

function read(...segments: string[]): string {
  return readFileSync(join(REPO_ROOT, ...segments), 'utf-8');
}

describe('screen-test-coverage sentinel wiring (UFR-021 Phase 2)', () => {
  it('.husky/pre-push invokes the sentinel as a fail-fast node gate', () => {
    const prePush = read('.husky', 'pre-push');

    expect(prePush).toContain(SENTINEL_REF);

    const failFastGate = new RegExp(
      `node[^\\n]*${SENTINEL_REF.replace('.', '\\.')}[^\\n]*\\|\\|\\s*exit\\s+1`,
    );
    expect(prePush).toMatch(failFastGate);
  });

  it('.github/workflows/ci-cd-mobile.yml references the sentinel', () => {
    const ciMobile = read('.github', 'workflows', 'ci-cd-mobile.yml');
    expect(ciMobile).toContain(SENTINEL_REF);
  });
});
