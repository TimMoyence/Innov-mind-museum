import 'reflect-metadata';
import {
  startPostgresTestContainer,
  type StartedPostgresTestContainer,
} from 'tests/helpers/e2e/postgres-testcontainer';

export interface IntegrationHarness {
  dataSource: import('typeorm').DataSource;
  reset: () => Promise<void>;
  stop: () => Promise<void>;
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
  process.env.JWT_ACCESS_SECRET ??= 'integration-access-secret';
  process.env.JWT_REFRESH_SECRET ??= 'integration-refresh-secret';
  process.env.RATE_LIMIT_IP ??= '10000';
  process.env.RATE_LIMIT_SESSION ??= '10000';
};

const buildHarness = async (
  container: StartedPostgresTestContainer,
): Promise<IntegrationHarness> => {
  setEnvForContainer(container);

  const { AppDataSource } = await import('@src/data/db/data-source');

  if (!AppDataSource.isInitialized) {
    AppDataSource.setOptions({
      host: container.host,
      port: container.port,
      username: container.user,
      password: container.password,
      database: container.database,
    });
    await AppDataSource.initialize();
  }
  await AppDataSource.runMigrations({ transaction: 'none' });

  const reset = async (): Promise<void> => {
    const tables = AppDataSource.entityMetadatas
      .filter((m) => m.tableType === 'regular')
      .map((m) => `"${m.tableName}"`);
    if (tables.length === 0) return;
    await AppDataSource.query(`TRUNCATE TABLE ${tables.join(', ')} RESTART IDENTITY CASCADE`);
    await AppDataSource.query(
      `INSERT INTO "museums" (id, name, slug, "museumType", is_active, version)
         VALUES (42, 'Test Tenant 42', 'test-tenant-42', 'general', true, 1),
                (99, 'Test Tenant 99', 'test-tenant-99', 'general', true, 1)
         ON CONFLICT (id) DO NOTHING`,
    );
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
    container.scheduleStop();
    process.once('exit', () => {
      if (AppDataSource.isInitialized) {
        AppDataSource.destroy().catch(() => undefined);
      }
    });
  };

  return { dataSource: AppDataSource, reset, stop, scheduleStop };
};

export const createIntegrationHarness = async (): Promise<IntegrationHarness> => {
  const workerId = process.env.JEST_WORKER_ID ?? '0';
  if (cached?.workerId === workerId) {
    return cached.harness;
  }
  if (cached) {
    await cached.harness.stop();
    cached = undefined;
  }
  const container = await startPostgresTestContainer();
  const harness = await buildHarness(container);
  cached = { workerId, container, harness };
  return harness;
};
