/**
 * Shared mock dependency factories for recurring test patterns.
 *
 * Only patterns that appear in 3+ test files are centralized here.
 * One-off mocks stay local to their test file.
 */

import type { DataSource, ObjectLiteral, Repository } from 'typeorm';

import { makeMockQb } from './mock-query-builder';

// ─── TypeORM mock DataSource + Repository ────────────────────────────

export interface MockRepoOptions {
  /** Additional methods to include on the mock repository */
  methods?: Partial<Record<string, jest.Mock>>;
  /** Custom query builder (defaults to makeMockQb()) */
  qb?: Record<string, jest.Mock>;
}

/**
 * Creates a mocked TypeORM Repository with common CRUD methods.
 *
 * All returned methods are jest.fn() stubs. The repo's `createQueryBuilder`
 * returns the provided (or default) mock query builder.
 */
export function makeMockTypeOrmRepo<T extends ObjectLiteral>(
  options: MockRepoOptions = {},
): { repo: jest.Mocked<Repository<T>>; qb: Record<string, jest.Mock> } {
  const qb = options.qb ?? makeMockQb();

  const repo = {
    find: jest.fn(),
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    save: jest.fn(),
    create: jest.fn().mockImplementation((data: unknown) => data),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
    countBy: jest.fn(),
    createQueryBuilder: jest.fn(() => qb),
    query: jest.fn(),
    ...options.methods,
  } as unknown as jest.Mocked<Repository<T>>;

  return { repo, qb };
}

/**
 * Creates a mocked DataSource wrapping a single repository.
 *
 * For multi-repo scenarios, use `makeMockDataSourceMulti` instead.
 */
export function makeMockDataSource<T extends ObjectLiteral>(
  repo: jest.Mocked<Repository<T>>,
): DataSource {
  return {
    getRepository: jest.fn().mockReturnValue(repo),
  } as unknown as DataSource;
}

/**
 * Creates a mocked DataSource with entity-based repository routing.
 *
 * @param repoMap - Map from entity class to its mock repository.
 * @param fallback - Optional fallback repository for unknown entities.
 */
export function makeMockDataSourceMulti(
  repoMap: Map<unknown, unknown>,
  fallback?: unknown,
): DataSource {
  return {
    getRepository: jest.fn((entity: unknown) => repoMap.get(entity) ?? fallback),
    query: jest.fn(),
  } as unknown as DataSource;
}
