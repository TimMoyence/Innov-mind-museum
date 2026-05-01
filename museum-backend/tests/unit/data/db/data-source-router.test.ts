/**
 * F Phase 2 — DataSourceRouter unit tests.
 *
 * env.ts caches values at module load time, so we cannot toggle DB_REPLICA_URL
 * at runtime and expect the singleton `env` to reflect the change. Instead we
 * assert the behaviour of the router under the default (no-replica) config:
 * both `write` and `read` must return the primary AppDataSource.
 */
import { AppDataSource } from '@data/db/data-source';
import { dataSourceRouter } from '@data/db/data-source-router';

describe('dataSourceRouter', () => {
  it('write always returns the primary AppDataSource', () => {
    expect(dataSourceRouter.write).toBe(AppDataSource);
  });

  it('read returns the primary when DB_REPLICA_URL is unset (env cached at module load)', () => {
    // env.ts is loaded once; DB_REPLICA_URL was unset at startup in test env.
    // dataSourceRouter.read therefore falls back to AppDataSource.
    expect(dataSourceRouter.read).toBe(AppDataSource);
  });

  it('write and read are identical when no replica is configured', () => {
    expect(dataSourceRouter.read).toBe(dataSourceRouter.write);
  });
});
