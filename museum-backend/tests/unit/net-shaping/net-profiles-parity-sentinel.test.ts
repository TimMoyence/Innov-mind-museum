/**
 * W1-REG-11 (RED) — parity sentinel self-test (spawn the real script).
 *
 * Spec: tasks.md W1-REG-11 + design.md §2 (model on sentry-scrubber-parity.mjs,
 * pure node:crypto). The sentinel `scripts/sentinels/net-profiles-parity.mjs`
 * (created in W1-REG-12) reads the FE registry + the BE vendored copy (BE path
 * overridable via env NET_PROFILES_BE_PATH), sha256s each data region, and:
 *   - exits 0 (PASS) when the two are byte-identical;
 *   - exits 1 with non-empty stderr when a temp-mutated BE copy diverges.
 *
 * This test FAILS until the script exists (spawn yields a non-zero exit for the
 * "byte-identical" case because `node <missing-file>` errors).
 *
 * lib-docs: none (node:child_process / node:fs / node:os — stdlib only).
 * No inline test entities — the sentinel reads the real registry files from disk.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// __dirname = museum-backend/tests/unit/net-shaping → repo root is four levels up.
const REPO_ROOT = join(__dirname, '..', '..', '..', '..');

const SENTINEL = join(REPO_ROOT, 'scripts', 'sentinels', 'net-profiles-parity.mjs');
const BE_REGISTRY = join(
  REPO_ROOT,
  'museum-backend',
  'src',
  'shared',
  'net-shaping',
  'networkProfiles.ts',
);

function runSentinel(env?: NodeJS.ProcessEnv) {
  return spawnSync('node', [SENTINEL], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

describe('net-profiles parity sentinel self-test (W1-REG-11)', () => {
  it('exits 0 when FE and BE registries are byte-identical', () => {
    const result = runSentinel();
    expect(result.status).toBe(0);
  });

  it('exits 1 with non-empty stderr when the BE copy diverges (NET_PROFILES_BE_PATH)', () => {
    // Materialise a mutated copy of the BE registry in a temp dir and point the
    // sentinel at it via the documented override env var.
    expect(existsSync(BE_REGISTRY)).toBe(true);
    const mutatedDir = mkdtempSync(join(tmpdir(), 'net-profiles-parity-'));
    const mutatedFile = join(mutatedDir, 'networkProfiles.ts');
    const original = readFileSync(BE_REGISTRY, 'utf8');
    // Flip a load-bearing canonical number so the data-region hash diverges.
    const mutated = original.replace('bwUpKbps: 90', 'bwUpKbps: 91');
    expect(mutated).not.toBe(original);
    writeFileSync(mutatedFile, mutated, 'utf8');

    const result = runSentinel({ NET_PROFILES_BE_PATH: mutatedFile });
    expect(result.status).toBe(1);
    expect((result.stderr ?? '').trim().length).toBeGreaterThan(0);
  });
});
