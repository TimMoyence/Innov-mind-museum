'use strict';

const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

const PREFIXES = [
  'museum-ia-e2e-',
  'museum-ia-redis-',
  'museum-ia-postgres-',
  'museum-ia-pgvector-',
];

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

const removeContainers = async (ids) => {
  if (ids.length === 0) return;
  await execFileAsync('docker', ['rm', '-f', '-v', ...ids], { encoding: 'utf8' }).catch(
    () => undefined,
  );
};

const pruneDanglingVolumes = async () => {
  await execFileAsync('docker', ['volume', 'prune', '-f'], { encoding: 'utf8' }).catch(
    () => undefined,
  );
};

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
