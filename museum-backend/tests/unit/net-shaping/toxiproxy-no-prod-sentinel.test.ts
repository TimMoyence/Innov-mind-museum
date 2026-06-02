/**
 * W3-03 (RED) — toxiproxy-no-prod sentinel self-test (spawn the real script).
 *
 * spec.md §EARS R2 + design.md §Architecture (2): the sentinel
 * `scripts/sentinels/toxiproxy-no-prod.mjs` (created in W3-04) guards that NO
 * production compose file and NO EAS build profile ever references the Toxiproxy
 * image or its ports (`:3100` shaped / `:8474` admin). Toxiproxy is a dev/CI-only
 * weak-net shaper; leaking it into a prod artifact = shipping a MITM proxy. It
 * MUST:
 *   - exit 0 when the scanned tree is clean;
 *   - exit 1 + non-empty stderr when a scanned file references the `toxiproxy`
 *     image OR the port `3100` OR the port `8474`.
 *
 * The sentinel accepts path overrides via env so this self-test points it at temp
 * fixtures WITHOUT mutating the real tree (mirrors the parity sentinel's
 * `NET_PROFILES_BE_PATH` precedent and the net-fault guard's `NET_FAULT_*` dirs):
 *   - TOXIPROXY_PROD_COMPOSE → a prod docker-compose path to scan
 *   - TOXIPROXY_EAS_JSON     → an EAS profile JSON path to scan
 *
 * RED state: the sentinel script does not exist yet → `node <missing-file>` exits
 * non-zero even for the "clean tree" case → the exit-0 assertion fails.
 *
 * Runtime-deferred (UFR-013): W3-06/07 (Maestro netshape flows + maestro-netshape
 * CI job + compression wall-clock metric) are NIGHTLY-only and are NOT covered by
 * this unit test.
 *
 * lib-docs: none — node:child_process / node:fs / node:os / node:path (stdlib).
 *   No external library imported. No inline test entities; fixtures are plain
 *   source-string files written to a temp dir.
 *
 * Frozen-test invariant: byte-immutable once manifested (phase=green).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// __dirname = museum-backend/tests/unit/net-shaping → repo root is four up.
const REPO_ROOT = join(__dirname, '..', '..', '..', '..');
const SENTINEL = join(REPO_ROOT, 'scripts', 'sentinels', 'toxiproxy-no-prod.mjs');

/** A clean prod compose + EAS json that the sentinel must accept (exit 0). */
function writeCleanFixtures(): { composePath: string; easPath: string } {
  const dir = mkdtempSync(join(tmpdir(), 'toxiproxy-no-prod-'));

  const composePath = join(dir, 'docker-compose.prod.yml');
  writeFileSync(
    composePath,
    [
      'services:',
      '  backend:',
      '    image: ghcr.io/musaium/backend:latest',
      '    ports:',
      "      - '3000:3000'",
      '  redis:',
      '    image: redis:7-alpine',
      '    ports:',
      "      - '6379:6379'",
    ].join('\n'),
    'utf8',
  );

  const easPath = join(dir, 'eas.json');
  writeFileSync(
    easPath,
    JSON.stringify(
      {
        build: {
          production: {
            android: { buildType: 'apk' },
            env: { API_URL: 'https://api.musaium.com' },
          },
        },
      },
      null,
      2,
    ),
    'utf8',
  );

  return { composePath, easPath };
}

function runSentinel(overrides: NodeJS.ProcessEnv) {
  return spawnSync('node', [SENTINEL], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...overrides },
  });
}

function envFor(f: { composePath: string; easPath: string }): NodeJS.ProcessEnv {
  return {
    TOXIPROXY_PROD_COMPOSE: f.composePath,
    TOXIPROXY_EAS_JSON: f.easPath,
  };
}

describe('toxiproxy-no-prod sentinel self-test (W3-03)', () => {
  it('the sentinel script exists at the canonical path (W3-04)', () => {
    // Documents the expected location; RED until W3-04 creates it.
    expect(existsSync(SENTINEL)).toBe(true);
  });

  it('exits 0 when the scanned prod artifacts are clean', () => {
    const f = writeCleanFixtures();
    const result = runSentinel(envFor(f));
    expect(result.status).toBe(0);
  });

  it('exits 1 when a prod compose references the toxiproxy image', () => {
    const f = writeCleanFixtures();
    writeFileSync(
      f.composePath,
      [
        'services:',
        '  toxiproxy:',
        '    image: ghcr.io/shopify/toxiproxy:2.9.0',
        '    ports:',
        "      - '8474:8474'",
      ].join('\n'),
      'utf8',
    );
    const result = runSentinel(envFor(f));
    expect(result.status).toBe(1);
    expect((result.stderr ?? '').trim().length).toBeGreaterThan(0);
  });

  it('exits 1 when a prod compose exposes the shaped port :3100', () => {
    const f = writeCleanFixtures();
    writeFileSync(
      f.composePath,
      [
        'services:',
        '  backend:',
        '    image: ghcr.io/musaium/backend:latest',
        '    ports:',
        "      - '3100:3000'",
      ].join('\n'),
      'utf8',
    );
    const result = runSentinel(envFor(f));
    expect(result.status).toBe(1);
    expect((result.stderr ?? '').trim().length).toBeGreaterThan(0);
  });

  it('exits 1 when an EAS profile references the admin port :8474', () => {
    const f = writeCleanFixtures();
    writeFileSync(
      f.easPath,
      JSON.stringify(
        { build: { production: { env: { PROXY_ADMIN: 'http://10.0.2.2:8474' } } } },
        null,
        2,
      ),
      'utf8',
    );
    const result = runSentinel(envFor(f));
    expect(result.status).toBe(1);
    expect((result.stderr ?? '').trim().length).toBeGreaterThan(0);
  });
});
