/**
 * C4 A5 (2026-05-21) — RED phase, spec R2.
 *
 * The sentinel `scripts/sentinels/fe-version-sync.mjs` (introduced in green)
 * MUST exit 0 when `museum-frontend/package.json` `.version` matches the
 * `version` field of the Expo config object emitted by
 * `museum-frontend/app.config.ts`, and exit 1 with a diff stderr otherwise.
 *
 * Why this test exists (drift case study):
 *  - `museum-frontend/package.json:4` says `1.2.4` (the npm manifest).
 *  - `museum-frontend/app.config.ts:121` literal `'1.2.3'` ships in the
 *    Expo binary (Xcode Cloud + EAS read app.config, not package.json).
 *  - A build today would TestFlight the wrong version with no signal.
 *
 * The sentinel + this test close that drift class. Today HEAD has neither
 * the sentinel script nor the contract — both assertions fail with ENOENT.
 *
 * Contract under test (RED expectations):
 *  - The sentinel reads `<root>/package.json` and the Expo config emitted by
 *    `<root>/app.config.ts`, where `<root>` defaults to `museum-frontend`
 *    but is overridable via env var `FE_VERSION_SYNC_FRONTEND_ROOT` so the
 *    test can inject a temp fixture without racing the real repo files.
 *  - Drift → exit 1 + stderr matches the exact diff message:
 *      `app.config.ts emitted version='<X>' but package.json says '<Y>'`
 *  - Match → exit 0.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const SENTINEL_PATH = path.join(REPO_ROOT, 'scripts/sentinels/fe-version-sync.mjs');

interface FixtureOpts {
  pkgVersion: string;
  appConfigVersion: string;
}

/**
 * Builds a temporary museum-frontend directory containing a minimal
 * `package.json` (just `name` + `version`) and a SYNTHETIC `app.config.ts`
 * that contains exactly one supported shape — a literal `version: '<X>'`
 * line — so the sentinel's LITERAL_RX matches and `appConfigVersion` is
 * what the sentinel reports.
 *
 * Why synthetic (not copy + patch from the live `museum-frontend/app.config.ts`):
 *  - The live `app.config.ts:128` is the require-shape:
 *      `version: (require('./package.json') as { version: string }).version,`
 *    For that shape, the sentinel emits `pkgVersion` directly (single
 *    source of truth) — drift cannot be expressed via the live file at all.
 *    A regex-patch (`/version:\s*['"][^'"]+['"]/`) over the live source
 *    matches NOTHING in the require-shape and the fixture silently produces
 *    R2a-equivalent behaviour, masking the drift test.
 *  - Synthesising the file from scratch decouples this test from the live
 *    source's exact shape, isolates the sentinel's parsing contract, and
 *    makes the LITERAL drift the only variable under test. The sentinel's
 *    REQUIRE_RX is exercised separately by R2a passing on HEAD (where the
 *    live source is the require-shape).
 *
 * The sentinel picks up `FE_VERSION_SYNC_FRONTEND_ROOT=<tmpDir>` to read
 * this fixture instead of the live repo files.
 */
function makeFeVersionSyncFixture(opts: FixtureOpts): string {
  const tmpRoot = mkdtempSync(path.join(tmpdir(), 'fe-version-sync-'));
  mkdirSync(tmpRoot, { recursive: true });

  // Minimal package.json — only fields the sentinel reads.
  writeFileSync(
    path.join(tmpRoot, 'package.json'),
    JSON.stringify({ name: 'musaium-mobile-fixture', version: opts.pkgVersion }, null, 2),
    'utf8',
  );

  // Synthetic app.config.ts: a minimal ExpoConfig-shaped object with a
  // single `version:` literal line that the sentinel's LITERAL_RX matches.
  // The sentinel does not import/evaluate this file — it does a static
  // regex parse — so the body does not need to be runnable.
  const syntheticAppConfig =
    `// Synthesised by tests/unit/sentinels/fe-version-sync.test.ts.\n` +
    `// Sentinel does a static regex parse, not a Node require/evaluate.\n` +
    `export default {\n` +
    `  name: 'musaium-mobile-fixture',\n` +
    `  slug: 'musaium-mobile-fixture',\n` +
    `  version: '${opts.appConfigVersion}',\n` +
    `};\n`;
  writeFileSync(path.join(tmpRoot, 'app.config.ts'), syntheticAppConfig, 'utf8');

  return tmpRoot;
}

describe('sentinel:fe-version-sync', () => {
  it('R2a — exits 0 when package.json and app.config.ts versions match (1.2.4 / 1.2.4)', () => {
    const fixture = makeFeVersionSyncFixture({
      pkgVersion: '1.2.4',
      appConfigVersion: '1.2.4',
    });

    const result = spawnSync('node', [SENTINEL_PATH], {
      cwd: REPO_ROOT,
      env: { ...process.env, FE_VERSION_SYNC_FRONTEND_ROOT: fixture },
      encoding: 'utf8',
    });

    if (result.status !== 0) {
      throw new Error(
        `Expected exit 0 (versions match), got ${result.status}. stderr=${result.stderr} stdout=${result.stdout}`,
      );
    }
    expect(result.status).toBe(0);
  });

  it('R2b — exits 1 with diff message when versions drift (1.2.4 pkg vs 1.2.3 app.config)', () => {
    const fixture = makeFeVersionSyncFixture({
      pkgVersion: '1.2.4',
      appConfigVersion: '1.2.3',
    });

    const result = spawnSync('node', [SENTINEL_PATH], {
      cwd: REPO_ROOT,
      env: { ...process.env, FE_VERSION_SYNC_FRONTEND_ROOT: fixture },
      encoding: 'utf8',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(
      /app\.config\.ts emitted version='1\.2\.3' but package\.json says '1\.2\.4'/,
    );
  });
});
