import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// __dirname = museum-frontend/__tests__/sentinels — climb 3 levels to repo root
// (mirrors maestro-shard-manifest.test.ts SENTINEL resolution).
const REPO_ROOT = join(__dirname, '..', '..', '..');

const SENTINEL_REF = 'screen-test-coverage.mjs';

function read(...segments: string[]): string {
  return readFileSync(join(REPO_ROOT, ...segments), 'utf-8');
}

describe('screen-test-coverage sentinel wiring (UFR-021 Phase 2)', () => {
  it('.husky/pre-push invokes the sentinel as a fail-fast node gate', () => {
    const prePush = read('.husky', 'pre-push');

    // The sentinel must be referenced at all.
    expect(prePush).toContain(SENTINEL_REF);

    // It must run as a fail-fast `node ... screen-test-coverage.mjs ... || exit 1`
    // gate — same pattern as every other pre-push sentinel gate.
    const failFastGate = new RegExp(
      `node[^\\n]*${SENTINEL_REF.replace('.', '\\.')}[^\\n]*\\|\\|\\s*exit\\s+1`,
    );
    expect(prePush).toMatch(failFastGate);
  });

  it('.github/workflows/ci-cd-mobile.yml references the sentinel', () => {
    const ciMobile = read('.github', 'workflows', 'ci-cd-mobile.yml');
    expect(ciMobile).toContain(SENTINEL_REF);
  });

  it('.github/workflows/sentinel-mirror.yml references the sentinel', () => {
    const sentinelMirror = read('.github', 'workflows', 'sentinel-mirror.yml');
    expect(sentinelMirror).toContain(SENTINEL_REF);
  });
});
