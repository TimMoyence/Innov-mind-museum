/**
 * C4 I-SEC1 (2026-05-21) — RED phase, spec R6.
 *
 * `scripts/sentinels/compose-parity.mjs` must catch `--maxmemory-policy`
 * drift between dev and prod docker-compose redis services. Today the
 * `CRITICAL_FLAGS` array only covers `--requirepass` (critical) and
 * `--appendonly` (warn) — adding `volatile-ttl` to prod without mirroring
 * in dev hides the eviction-policy contract from local repro.
 *
 * Contract under test (RED expectations):
 *  - `CRITICAL_FLAGS` includes `{ flag: '--maxmemory-policy', severity:
 *    'critical', services: ['redis'] }`.
 *  - When prod redis has `--maxmemory-policy` but dev does not → sentinel
 *    exits 1 with stderr that mentions both the flag name and the
 *    `service "redis"` token (matches the existing FAIL message shape on
 *    `compose-parity.mjs:158`).
 *  - When both prod AND dev have the flag → sentinel exits 0.
 *
 * Test injects fixture compose files via env overrides
 * `COMPOSE_PARITY_PROD_PATH` / `COMPOSE_PARITY_DEV_PATH` so we never race
 * the real `docker-compose.{dev,prod}.yml`. The sentinel currently hard-
 * codes those paths (`compose-parity.mjs:48-49`) — green phase adds the
 * env overrides (design D2).
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const SENTINEL_PATH = path.join(REPO_ROOT, 'scripts/sentinels/compose-parity.mjs');

interface ComposeFixtureOpts {
  prod: string[];
  dev: string[];
}

/**
 * Renders a minimal docker-compose YAML with a single `redis` service whose
 * `command:` is the supplied list. Mirrors the 2-space top-level/4-space
 * sub-key layout `compose-parity.mjs:extractServiceCommands` expects.
 */
function renderComposeYaml(commandList: string[]): string {
  const lines: string[] = ['services:', '  redis:', "    image: 'redis:7-alpine'", '    command:'];
  for (const token of commandList) {
    lines.push(`      - '${token}'`);
  }
  return lines.join('\n') + '\n';
}

function makeComposeParityFixture(opts: ComposeFixtureOpts): { prod: string; dev: string } {
  const tmpRoot = mkdtempSync(path.join(tmpdir(), 'compose-parity-maxmemory-'));
  const prodPath = path.join(tmpRoot, 'docker-compose.prod.yml');
  const devPath = path.join(tmpRoot, 'docker-compose.dev.yml');
  writeFileSync(prodPath, renderComposeYaml(opts.prod), 'utf8');
  writeFileSync(devPath, renderComposeYaml(opts.dev), 'utf8');
  return { prod: prodPath, dev: devPath };
}

describe('sentinel:compose-parity — --maxmemory-policy', () => {
  it('R6a — exits 0 when both prod and dev have --maxmemory-policy', () => {
    const { prod, dev } = makeComposeParityFixture({
      prod: [
        'redis-server',
        '--requirepass',
        'x',
        '--maxmemory',
        '512mb',
        '--maxmemory-policy',
        'volatile-ttl',
      ],
      dev: ['redis-server', '--requirepass', 'x', '--maxmemory-policy', 'volatile-ttl'],
    });

    const result = spawnSync('node', [SENTINEL_PATH], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        COMPOSE_PARITY_PROD_PATH: prod,
        COMPOSE_PARITY_DEV_PATH: dev,
      },
      encoding: 'utf8',
    });

    if (result.status !== 0) {
      throw new Error(
        `Expected exit 0 (both have --maxmemory-policy), got ${result.status}. stderr=${result.stderr} stdout=${result.stdout}`,
      );
    }
    expect(result.status).toBe(0);
  });

  it('R6b — exits 1 when prod has --maxmemory-policy but dev does not', () => {
    const { prod, dev } = makeComposeParityFixture({
      prod: ['redis-server', '--requirepass', 'x', '--maxmemory-policy', 'volatile-ttl'],
      dev: ['redis-server', '--requirepass', 'x'],
    });

    const result = spawnSync('node', [SENTINEL_PATH], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        COMPOSE_PARITY_PROD_PATH: prod,
        COMPOSE_PARITY_DEV_PATH: dev,
      },
      encoding: 'utf8',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/--maxmemory-policy/);
    expect(result.stderr).toMatch(/service "redis"/);
  });
});
