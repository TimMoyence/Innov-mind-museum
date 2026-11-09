import type { DataSource, ObjectLiteral, Repository } from 'typeorm';

import { makeMockQb } from './mock-query-builder';

export interface MockRepoOptions {
  methods?: Partial<Record<string, jest.Mock>>;
  qb?: Record<string, jest.Mock>;
  columnMap?: Record<string, string>;
}

export function makeMockTypeOrmRepo<T extends ObjectLiteral>(
  options: MockRepoOptions = {},
): { repo: jest.Mocked<Repository<T>>; qb: Record<string, jest.Mock> } {
  const qb = options.qb ?? makeMockQb();

  const metadata = options.columnMap
    ? {
        findColumnWithPropertyName: (propertyName: string) => {
          const databaseName = options.columnMap?.[propertyName];
          if (databaseName === undefined) return undefined;
          return { databaseName };
        },
      }
    : undefined;

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
    ...(metadata ? { metadata } : {}),
    ...options.methods,
  } as unknown as jest.Mocked<Repository<T>>;

  return { repo, qb };
}

export function makeMockDataSource<T extends ObjectLiteral>(
  repo: jest.Mocked<Repository<T>>,
): DataSource {
  return {
    getRepository: jest.fn().mockReturnValue(repo),
    query: jest.fn(),
  } as unknown as DataSource;
}

export function makeMockDataSourceMulti(
  repoMap: Map<unknown, unknown>,
  fallback?: unknown,
): DataSource {
  return {
    getRepository: jest.fn((entity: unknown) => repoMap.get(entity) ?? fallback),
    query: jest.fn(),
  } as unknown as DataSource;
}
