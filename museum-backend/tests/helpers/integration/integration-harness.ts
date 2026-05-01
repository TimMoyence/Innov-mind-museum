import 'reflect-metadata';
import {
  startPostgresTestContainer,
  type StartedPostgresTestContainer,
} from 'tests/helpers/e2e/postgres-testcontainer';

/**
 * Test utility: handle for an integration test environment.
 * Wraps a per-Jest-worker Postgres testcontainer with a TypeORM DataSource
 * that has all migrations applied. `reset()` truncates domain tables
 * without dropping schema (fast per-test cleanup).
 */
export interface IntegrationHarness {
  /** TypeORM DataSource — the singleton AppDataSource bound to the container. */
  dataSource: import('typeorm').DataSource;
  /** TRUNCATE every TypeORM entity table CASCADE + RESTART IDENTITY. ~5ms. */
  reset: () => Promise<void>;
  /** Stop the container. Idempotent. */
  stop: () => Promise<void>;
  /** Wire afterAll(stop) for the calling Jest suite. */
  scheduleStop: () => void;
}

interface CachedHarness {
  workerId: string;
  container: StartedPostgresTestContainer;
  harness: IntegrationHarness;
}

let cached: CachedHarness | undefined;

const setEnvForContainer = (container: StartedPostgresTestContainer): void => {
  process.env.NODE_ENV = 'test';
  process.env.DB_HOST = container.host;
  process.env.DB_PORT = String(container.port);
  process.env.DB_USER = container.user;
  process.env.DB_PASSWORD = container.password;
  process.env.PGDATABASE = container.database;
  process.env.DB_SYNCHRONIZE = 'false';
  // JWT secrets required by env.ts validation, even though we don't issue
  // tokens at the harness layer (route-level tests may need them).
  process.env.JWT_ACCESS_SECRET ??= 'integration-access-secret';
  process.env.JWT_REFRESH_SECRET ??= 'integration-refresh-secret';
  // Disable rate-limit interference for integration tests.
  process.env.RATE_LIMIT_IP ??= '10000';
  process.env.RATE_LIMIT_SESSION ??= '10000';
};

const buildHarness = async (
  container: StartedPostgresTestContainer,
): Promise<IntegrationHarness> => {
  setEnvForContainer(container);

  // Dynamic import AFTER env vars are set so AppDataSource binds to the container.
  const { AppDataSource } = await import('@src/data/db/data-source');

  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }
  // Use transaction: 'none' so that migrations with `transaction = false`
  // (e.g. CONCURRENTLY indexes) are not forcibly wrapped in a transaction.
  await AppDataSource.runMigrations({ transaction: 'none' });

  const reset = async (): Promise<void> => {
    const tables = AppDataSource.entityMetadatas
      .filter((m) => m.tableType === 'regular')
      .map((m) => `"${m.tableName}"`);
    if (tables.length === 0) return;
    await AppDataSource.query(`TRUNCATE TABLE ${tables.join(', ')} RESTART IDENTITY CASCADE`);
  };

  let stopped = false;
  const stop = async (): Promise<void> => {
    if (stopped) return;
    stopped = true;
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
    await container.stop();
    cached = undefined;
  };

  const scheduleStop = (): void => {
    // Delegate to the container's background-process cleanup (spawn + detach)
    // so this is callable inside beforeAll without violating jest-circus's
    // "no afterAll after tests have started" rule.
    container.scheduleStop();
    // Also register a process-exit hook so the DataSource is closed cleanly.
    process.once('exit', () => {
      if (AppDataSource.isInitialized) {
        // Synchronous destroy is not available — best effort.
        AppDataSource.destroy().catch(() => undefined);
      }
    });
  };

  return { dataSource: AppDataSource, reset, stop, scheduleStop };
};

/**
 * Create (or reuse) a Postgres testcontainer for the current Jest worker,
 * apply migrations, return a harness with reset/stop/DataSource.
 */
export const createIntegrationHarness = async (): Promise<IntegrationHarness> => {
  const workerId = process.env.JEST_WORKER_ID ?? '0';
  if (cached && cached.workerId === workerId) {
    return cached.harness;
  }
  if (cached) {
    // Worker id changed — should be rare; clean up the stale container.
    await cached.harness.stop();
    cached = undefined;
  }
  const container = await startPostgresTestContainer();
  const harness = await buildHarness(container);
  cached = { workerId, container, harness };
  return harness;
};
