import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const PREFIXES = ['museum-ia-e2e-', 'museum-ia-redis-'] as const;

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

const removeContainers = async (ids: string[]): Promise<void> => {
  if (ids.length === 0) return;
  await execFileAsync('docker', ['rm', '-f', ...ids], { encoding: 'utf8' }).catch(() => undefined);
};

export default async function globalTeardown(): Promise<void> {
  const all = await Promise.all(PREFIXES.map(listContainers));
  const ids = all.flat();
  if (ids.length === 0) return;

  await removeContainers(ids);

  if (process.env.JEST_TEARDOWN_VERBOSE === '1') {
    process.stdout.write(`[jest-global-teardown] reaped ${ids.length} leaked test container(s)\n`);
  }
}
