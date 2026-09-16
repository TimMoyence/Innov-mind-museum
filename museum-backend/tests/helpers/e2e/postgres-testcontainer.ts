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
 * `docker run -d` returns as soon as the container is CREATED — the published port
 * mapping is not necessarily visible to `docker inspect` yet. Reading it eagerly
 * made the whole integration suite non-deterministic:
 *
 *   docker inspect --format {{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}} …
 *     failed: error calling index: reflect: slice index out of range
 *
 * Two defects, both fixed here:
 *
 * 1. **The template itself panics.** Go's `index` on an empty slice aborts the whole
 *    `docker inspect` (non-zero exit), so the caller could not even tell "not published
 *    yet" from "container is dead". `{{with …}}` yields the empty string instead of
 *    exploding, which turns the race into an observable, retryable state.
 * 2. **No wait.** The port was read once, immediately. `waitForPostgres` below does poll
 *    — but it runs AFTER this lookup, so it never protected it. We poll here too.
 *
 * If the container has actually exited (bad image, port clash, OOM), we fail fast with
 * its exit code and last logs rather than spinning until the deadline.
 */
const PORT_RESOLVE_DEADLINE_MS = 30_000;
const PORT_RESOLVE_INTERVAL_MS = 200;

const resolveMappedPort = async (containerId: string, containerName: string): Promise<number> => {
  const startedAt = Date.now();
  let lastRaw = '';

  while (Date.now() - startedAt < PORT_RESOLVE_DEADLINE_MS) {
    // `with` short-circuits on an empty/absent mapping → prints nothing, exit 0.
    lastRaw = await runDocker(
      'inspect',
      '--format',
      '{{with index .NetworkSettings.Ports "5432/tcp"}}{{with index . 0}}{{.HostPort}}{{end}}{{end}}',
      containerId,
    );

    const port = Number(lastRaw);
    if (Number.isInteger(port) && port > 0) {
      return port;
    }

    // Not published yet — unless the container is already gone, in which case
    // polling for 30 s would just hide the real cause.
    const state = await runDocker(
      'inspect',
      '--format',
      '{{.State.Running}} {{.State.ExitCode}}',
      containerId,
    ).catch(() => 'gone -1');

    if (!state.startsWith('true')) {
      const logs = await runDocker('logs', '--tail', '20', containerId).catch(() => '(no logs)');
      throw new Error(
        `postgres testcontainer ${containerName} is not running (state: ${state}). Last logs:\n${logs}`,
      );
    }

    await sleep(PORT_RESOLVE_INTERVAL_MS);
  }

  throw new Error(
    `postgres testcontainer ${containerName}: port 5432/tcp still unpublished after ${String(
      PORT_RESOLVE_DEADLINE_MS,
    )}ms (last inspect output: "${lastRaw}")`,
  );
};

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
    'pgvector/pgvector:pg16',
  );

  const stop = async (): Promise<void> => {
    await runDocker('stop', '--time', '1', containerId).catch(async () => {
      await runDocker('rm', '-f', containerId).catch(() => undefined);
    });
  };
  /**
   * Reap the container when the Jest process dies — NOT after a fixed delay.
   *
   * The previous form was `sleep 30; docker stop …`, spawned detached from
   * `beforeAll` (jest-circus forbids registering `afterAll` once tests have
   * started, hence the fire-and-forget shape). The countdown started IMMEDIATELY,
   * so any integration suite running longer than 30 s had its database
   * TRUNCATE'd out from under it mid-test:
   *
   *   QueryFailedError: terminating connection due to administrator command
   *
   * Jest resets the module registry per test FILE, so the harness cache is
   * per-file and every integration suite spins up its own container — each one
   * scheduling its own 30 s execution. It was a latent time bomb: a suite that
   * simply grew past 30 s started failing with no change of its own
   * (`chat-repository-typeorm.integration.test.ts`, 37 s — caught 2026-07-14).
   *
   * We now poll the OWNING pid (captured here, before detaching — a detached
   * child is reparented to init, so `$PPID` is useless) and stop the container
   * the moment that process is gone. The container therefore lives exactly as
   * long as the tests that need it, whatever their duration. The hard cap only
   * exists so a hung Jest cannot leak a container forever.
   */
  const scheduleStop = (): void => {
    const ownerPid = process.pid;
    const capSeconds = 30 * 60;
    // NEWLINE-separated, not space-separated: `i=0 while …` and `done docker stop`
    // are shell SYNTAX ERRORS (the reaper then dies instantly, every container
    // leaks, Docker suffocates and the next suite gets ECONNREFUSED — observed
    // 2026-07-14, 19 containers leaked in one run). Kept as an array + join('\n')
    // so the shape stays obvious; `sh -n` on this string must stay clean.
    const cleanupCommand = [
      `i=0`,
      `while kill -0 ${String(ownerPid)} 2>/dev/null && [ "$i" -lt ${String(capSeconds)} ]; do`,
      `  i=$((i+1))`,
      `  sleep 1`,
      `done`,
      `docker stop --time 1 ${containerId} >/dev/null 2>&1 || docker rm -f ${containerId} >/dev/null 2>&1 || true`,
    ].join('\n');

    const cleanupProcess = spawn('sh', ['-c', cleanupCommand], {
      detached: true,
      stdio: 'ignore',
    });
    cleanupProcess.unref();
  };

  try {
    const hostPort = await resolveMappedPort(containerId, containerName);

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
