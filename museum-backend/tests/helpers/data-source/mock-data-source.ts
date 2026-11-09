import type { DataSource } from 'typeorm';

export interface MockDataSourceHandle {
  dataSource: DataSource;
  getRepository: jest.Mock;
}

export function makeMockDataSource(): MockDataSourceHandle {
  const getRepository = jest.fn(() => ({}));
  const dataSource = { getRepository } as unknown as DataSource;
  return { dataSource, getRepository };
}
