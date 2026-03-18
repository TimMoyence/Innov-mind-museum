import { execFile, spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

interface ExecError extends Error {
  stderr?: string;
}

const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

const runDocker = async (...args: string[]): Promise<string> => {
  try {
    const { stdout } = await execFileAsync('docker', args, { encoding: 'utf8' });
    return stdout.trim();
  } catch (error) {
    const execError = error as ExecError;
    const details = execError.stderr?.trim() || execError.message;
    throw new Error(`docker ${args.join(' ')} failed: ${details}`);
  }
};

const waitForPostgres = async (params: {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}): Promise<void> => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const client = new Client({
      host: params.host,
      port: params.port,
      user: params.user,
      password: params.password,
      database: params.database,
    });

    try {
      await client.connect();
      await client.query('SELECT 1');
      await client.end();
      return;
    } catch {
      await client.end().catch(() => undefined);
      await sleep(500);
    }
  }

  throw new Error('Postgres test container was not ready in time');
};

/** Test utility: handle for a running ephemeral Postgres Docker container with connection details and cleanup methods. */
export interface StartedPostgresTestContainer {
  containerName: string;
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  stop: () => Promise<void>;
  scheduleStop: () => void;
}

/**
 * Test utility: starts an ephemeral Postgres 16 Docker container on a random port and waits until it accepts connections.
 * @returns Handle with connection details and stop/scheduleStop methods.
 */
export const startPostgresTestContainer = async (): Promise<StartedPostgresTestContainer> => {
  const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
  const containerName = `museum-ia-e2e-${suffix}`;
  const database = `museum_ia_e2e_${suffix}`;
  const user = 'museum_e2e';
  const password = 'museum_e2e_password';

  const containerId = await runDocker(
    'run',
    '-d',
    '--rm',
    '--name',
    containerName,
    '-e',
    `POSTGRES_DB=${database}`,
    '-e',
    `POSTGRES_USER=${user}`,
    '-e',
    `POSTGRES_PASSWORD=${password}`,
    '-p',
    '127.0.0.1::5432',
    'postgres:16-alpine',
  );

  const stop = async (): Promise<void> => {
    await runDocker('stop', '--time', '1', containerId).catch(async () => {
      await runDocker('rm', '-f', containerId).catch(() => undefined);
    });
  };
  const scheduleStop = (): void => {
    const cleanupCommand = `sleep 30; docker stop --time 1 ${containerId} >/dev/null 2>&1 || docker rm -f ${containerId} >/dev/null 2>&1 || true`;
    const cleanupProcess = spawn('sh', ['-c', cleanupCommand], {
      detached: true,
      stdio: 'ignore',
    });
    cleanupProcess.unref();
  };

  try {
    const hostPortRaw = await runDocker(
      'inspect',
      '--format',
      '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}',
      containerId,
    );
    const hostPort = Number(hostPortRaw);

    if (!Number.isInteger(hostPort) || hostPort <= 0) {
      throw new Error(`Invalid mapped postgres port: "${hostPortRaw}"`);
    }

    await waitForPostgres({
      host: '127.0.0.1',
      port: hostPort,
      user,
      password,
      database,
    });

    return {
      containerName,
      host: '127.0.0.1',
      port: hostPort,
      user,
      password,
      database,
      stop,
      scheduleStop,
    };
  } catch (error) {
    await stop();
    throw error;
  }
};
