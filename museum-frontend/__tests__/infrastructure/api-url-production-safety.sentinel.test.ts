/**
 * RED phase — run 2026-06-06-api-url-prod-safety (UFR-022), T1.3.
 *
 * Self-test for the new sentinel
 * `museum-frontend/scripts/sentinels/api-url-production-safety.mjs` (design §7,
 * D6). The sentinel statically guards that the build-time API-URL path can
 * never ship localhost for a production-class build. It accepts an
 * `API_URL_SAFETY_MODULE` env override (absolute path) to point at a fixture
 * module — mirroring the `FE_VERSION_SYNC_FRONTEND_ROOT` override of the
 * existing `fe-version-sync.mjs` sentinel.
 *
 * Contract under test:
 *   - SAFE fixture   => sentinel exits 0.
 *   - UNSAFE fixture => sentinel exits 1.
 *
 * The sentinel does NOT exist yet, so spawning it fails (ERR_MODULE_NOT_FOUND
 * / non-zero exit for the safe fixture too) — that is the RED success proving
 * the sentinel is absent.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const SENTINEL_PATH = path.resolve(
  __dirname,
  '../../scripts/sentinels/api-url-production-safety.mjs',
);
const SAFE_FIXTURE = path.resolve(__dirname, '../../scripts/sentinels/__fixtures__/safe-config.js');
const UNSAFE_FIXTURE = path.resolve(
  __dirname,
  '../../scripts/sentinels/__fixtures__/unsafe-config.js',
);

const runSentinel = (fixtureAbsPath: string): { status: number | null; stderr: string } => {
  const result = spawnSync('node', [SENTINEL_PATH], {
    env: { ...process.env, API_URL_SAFETY_MODULE: fixtureAbsPath },
    encoding: 'utf8',
  });
  return { status: result.status, stderr: result.stderr ?? '' };
};

describe('sentinel api-url-production-safety — self-test', () => {
  it('exits 0 for a SAFE config fixture (prod constant, fail-loud on localhost)', () => {
    const { status } = runSentinel(SAFE_FIXTURE);
    expect(status).toBe(0);
  });

  it('exits 1 for an UNSAFE config fixture (silent localhost for production)', () => {
    const { status } = runSentinel(UNSAFE_FIXTURE);
    expect(status).toBe(1);
  });

  it('exits 0 against the real repo module (no localhost for production)', () => {
    // No override => the sentinel checks the real museum-frontend/api-url.config.js.
    const result = spawnSync('node', [SENTINEL_PATH], {
      env: { ...process.env },
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
  });
});
