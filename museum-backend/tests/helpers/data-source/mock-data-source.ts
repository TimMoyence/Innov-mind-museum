import type { DataSource } from 'typeorm';

/**
 * Minimal TypeORM `DataSource` mock for unit tests that only need to satisfy
 * the `getRepository(entity)` calls performed at module-build time. Each
 * lookup returns an empty object — modules that only store the repo handle
 * (without exercising it) work transparently.
 *
 * Use when a module wires `new SomeRepo(dataSource.getRepository(Entity))`
 * but the test scenario short-circuits before any DB call is made (e.g.
 * feature-flag-off branches).
 */
export interface MockDataSourceHandle {
  dataSource: DataSource;
  getRepository: jest.Mock;
}

export function makeMockDataSource(): MockDataSourceHandle {
  const getRepository = jest.fn(() => ({}));
  const dataSource = { getRepository } as unknown as DataSource;
  return { dataSource, getRepository };
}
