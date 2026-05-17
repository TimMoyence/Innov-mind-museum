import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Container-name prefixes spawned by the test harness (via testcontainers).
 * Tests that introduce a new spawn prefix MUST register it here so the safety
 * net keeps reaping everything — orphan containers AND their anonymous volumes
 * — even when the harness `afterAll`/`scheduleStop` never ran (worker crash,
 * signal, force-exit). Per `feedback_zero_bypass.md` corollary 2026-05-17 :
 * no leaked container, no leaked volume, ever.
 */
const PREFIXES = [
  'museum-ia-e2e-',
  'museum-ia-redis-',
  'museum-ia-postgres-',
  'museum-ia-pgvector-',
] as const;

const listContainers = async (prefix: string): Promise<string[]> => {
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
 * @param ids
 */
const removeContainers = async (ids: string[]): Promise<void> => {
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
 */
const pruneDanglingVolumes = async (): Promise<void> => {
  await execFileAsync('docker', ['volume', 'prune', '-f'], { encoding: 'utf8' }).catch(
    () => undefined,
  );
};

export default async function globalTeardown(): Promise<void> {
  const all = await Promise.all(PREFIXES.map(listContainers));
  const ids = all.flat();
  await removeContainers(ids);
  await pruneDanglingVolumes();

  if (process.env.JEST_TEARDOWN_VERBOSE === '1') {
    process.stdout.write(
      `[jest-global-teardown] reaped ${ids.length} leaked test container(s) and pruned dangling anonymous volumes\n`,
    );
  }
}
