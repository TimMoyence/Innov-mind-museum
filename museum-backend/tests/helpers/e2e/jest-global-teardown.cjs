// @ts-check
'use strict';

/**
 * Jest global teardown (CommonJS).
 *
 * Ported from `jest-global-teardown.ts` (W1, run 2026-05-26-kr-domains): the
 * top-level `globalTeardown` is shared by ALL jest projects, including
 * `scripts-esm` which runs with `transform: {}` under
 * `NODE_OPTIONS=--experimental-vm-modules`. In that runner jest loads the
 * teardown via the native-ESM require path, which cannot parse TypeScript
 * syntax (`as const`, type annotations) → `SyntaxError: Unexpected identifier
 * 'as'`, making `pnpm run test:scripts` exit non-zero even when every
 * assertion passes. A `.cjs` module is always loaded by node's CommonJS loader
 * (no transform, no native-ESM parse) so it is runner-agnostic. The Docker
 * cleanup behaviour for the `unit-integration` / `e2e` projects is unchanged —
 * the logic below is byte-equivalent to the former `.ts` (types erased only).
 *
 * Container-name prefixes spawned by the test harness (via testcontainers).
 * Tests that introduce a new spawn prefix MUST register it here so the safety
 * net keeps reaping everything — orphan containers AND their anonymous volumes
 * — even when the harness `afterAll`/`scheduleStop` never ran (worker crash,
 * signal, force-exit). Per `feedback_zero_bypass.md` corollary 2026-05-17 :
 * no leaked container, no leaked volume, ever.
 */
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

const PREFIXES = [
  'museum-ia-e2e-',
  'museum-ia-redis-',
  'museum-ia-postgres-',
  'museum-ia-pgvector-',
];

/**
 * @param {string} prefix
 * @returns {Promise<string[]>}
 */
const listContainers = async (prefix) => {
  try {
    const { stdout } = await execFileAsync('docker', ['ps', '-aq', '--filter', `name=${prefix}`], {
      encoding: 'utf8',
    });
    return stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  } catch {
    return [];
  }
};

/**
 * `rm -f -v` : `-f` kills running containers, `-v` removes ALL anonymous
 * volumes associated with the container in the same atomic call. Without `-v`
 * the volumes survive as 64-hex orphans in `docker volume ls`, accumulating
 * across runs until the host runs out of disk.
 * @param {string[]} ids
 * @returns {Promise<void>}
 */
const removeContainers = async (ids) => {
  if (ids.length === 0) return;
  await execFileAsync('docker', ['rm', '-f', '-v', ...ids], { encoding: 'utf8' }).catch(
    () => undefined,
  );
};

/**
 * Best-effort sweep of dangling anonymous volumes left over by interrupted
 * earlier runs (i.e. volumes whose container was killed by SIGKILL before
 * this teardown could fire `rm -v`). Since Docker 23 `volume prune` defaults
 * to anonymous-only — named volumes attached to live compose services
 * (`museum-backend_pgdata_dev`, etc.) are NEVER affected because they
 * remain "in use" from Docker's POV.
 * @returns {Promise<void>}
 */
const pruneDanglingVolumes = async () => {
  await execFileAsync('docker', ['volume', 'prune', '-f'], { encoding: 'utf8' }).catch(
    () => undefined,
  );
};

/**
 * @returns {Promise<void>}
 */
module.exports = async function globalTeardown() {
  const all = await Promise.all(PREFIXES.map(listContainers));
  const ids = all.flat();
  await removeContainers(ids);
  await pruneDanglingVolumes();

  if (process.env.JEST_TEARDOWN_VERBOSE === '1') {
    process.stdout.write(
      `[jest-global-teardown] reaped ${ids.length} leaked test container(s) and pruned dangling anonymous volumes\n`,
    );
  }
};
