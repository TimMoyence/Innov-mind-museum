import { Museum } from '@modules/museum/domain/museum.entity';

import type { IMuseumRepository } from '@modules/museum/domain/museum.repository.interface';

/** Shared mock IMuseumRepository factory. All methods default to jest.fn(). */
export const makeMuseumRepo = (
  overrides: Partial<jest.Mocked<IMuseumRepository>> = {},
): jest.Mocked<IMuseumRepository> => ({
  create: jest.fn(),
  update: jest.fn(),
  findById: jest.fn(),
  findBySlug: jest.fn(),
  findAll: jest.fn().mockResolvedValue([]),
  findInBoundingBox: jest.fn().mockResolvedValue([]),
  delete: jest.fn(),
  ...overrides,
});

/** Shared Museum entity factory with sensible defaults. */
export const makeMuseum = (overrides: Partial<Museum> = {}): Museum =>
  Object.assign(new Museum(), {
    id: 1,
    name: 'Test Museum',
    slug: 'test-museum',
    address: '123 Test Street',
    description: null,
    config: {},
    latitude: 48.8566,
    longitude: 2.3522,
    isActive: true,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  });
