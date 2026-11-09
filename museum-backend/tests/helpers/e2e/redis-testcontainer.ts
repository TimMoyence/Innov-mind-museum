import { execFile, spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { promisify } from 'util';

import Redis from 'ioredis';

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
    const details = execError.stderr?.trim() ?? execError.message;
    throw new Error(`docker ${args.join(' ')} failed: ${details}`, { cause: error });
  }
};

const waitForRedis = async (params: { host: string; port: number }): Promise<void> => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const client = new Redis({
      host: params.host,
      port: params.port,
      lazyConnect: true,
      maxRetriesPerRequest: 0,
      enableOfflineQueue: false,
    });

    try {
      await client.connect();
      const pong = await client.ping();
      if (pong === 'PONG') {
        client.disconnect();
        return;
      }
      client.disconnect();
    } catch {
      client.disconnect();
      await sleep(500);
    }
  }

  throw new Error('Redis test container was not ready in time');
};

export interface StartedRedisTestContainer {
  containerName: string;
  host: string;
  port: number;
  connection: { host: string; port: number };
  stop: () => Promise<void>;
  scheduleStop: () => void;
}

export const startRedisTestContainer = async (): Promise<StartedRedisTestContainer> => {
  const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
  const containerName = `museum-ia-redis-${suffix}`;

  const containerId = await runDocker(
    'run',
    '-d',
    '--rm',
    '--name',
    containerName,
    '-p',
    '127.0.0.1::6379',
    'redis:7-alpine',
  );

  const stop = async (): Promise<void> => {
    await runDocker('stop', '--time', '1', containerId).catch(async () => {
      await runDocker('rm', '-f', containerId).catch(() => undefined);
    });
  };

  const scheduleStop = (): void => {
    const cleanupCommand = `sleep 30; docker stop --time 1 ${containerId} >/dev/null 2>&1 || docker rm -f ${containerId} >/dev/null 2>&1 || true`;
    const cleanupProcess = spawn('/bin/sh', ['-c', cleanupCommand], {
      detached: true,
      stdio: 'ignore',
    });
    cleanupProcess.unref();
  };

  try {
    const hostPortRaw = await runDocker(
      'inspect',
      '--format',
      '{{(index (index .NetworkSettings.Ports "6379/tcp") 0).HostPort}}',
      containerId,
    );
    const hostPort = Number(hostPortRaw);

    if (!Number.isInteger(hostPort) || hostPort <= 0) {
      throw new Error(`Invalid mapped redis port: "${hostPortRaw}"`);
    }

    await waitForRedis({ host: '127.0.0.1', port: hostPort });

    return {
      containerName,
      host: '127.0.0.1',
      port: hostPort,
      connection: { host: '127.0.0.1', port: hostPort },
      stop,
      scheduleStop,
    };
  } catch (error) {
    await stop();
    throw error;
  }
};
