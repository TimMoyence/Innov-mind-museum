import type { DataSource, Repository } from 'typeorm';

import { Museum } from '@modules/museum/core/domain/museum.entity';
import { AppError } from '@shared/errors/app.error';

import { MuseumRepositoryPg } from '@modules/museum/adapters/secondary/museum.repository.pg';

// ─── Museum factory ───
function makeMuseum(overrides: Partial<Museum> = {}): Museum {
  return {
    id: 1,
    name: 'Louvre',
    slug: 'louvre',
    address: '75001 Paris',
    description: 'Famous museum',
    config: {},
    latitude: 48.8606,
    longitude: 2.3376,
    isActive: true,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  } as Museum;
}

function buildMocks() {
  const repo = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  } as unknown as jest.Mocked<Repository<Museum>>;

  const dataSource = {
    getRepository: jest.fn().mockReturnValue(repo),
  } as unknown as DataSource;

  return { repo, dataSource };
}

describe('MuseumRepositoryPg', () => {
  let sut: MuseumRepositoryPg;
  let repo: jest.Mocked<Repository<Museum>>;

  beforeEach(() => {
    jest.clearAllMocks();
    const mocks = buildMocks();
    repo = mocks.repo;
    sut = new MuseumRepositoryPg(mocks.dataSource);
  });

  // ─── create ───
  describe('create', () => {
    it('creates and saves a museum', async () => {
      const museum = makeMuseum();
      repo.create.mockReturnValue(museum);
      repo.save.mockResolvedValue(museum);

      const result = await sut.create({
        name: 'Louvre',
        slug: 'louvre',
        address: '75001 Paris',
        description: 'Famous museum',
        latitude: 48.8606,
        longitude: 2.3376,
        config: {},
      });

      expect(repo.create).toHaveBeenCalledWith({
        name: 'Louvre',
        slug: 'louvre',
        address: '75001 Paris',
        description: 'Famous museum',
        latitude: 48.8606,
        longitude: 2.3376,
        config: {},
      });
      expect(repo.save).toHaveBeenCalledWith(museum);
      expect(result).toBe(museum);
    });

    it('handles optional fields as null', async () => {
      const museum = makeMuseum({ address: null, description: null });
      repo.create.mockReturnValue(museum);
      repo.save.mockResolvedValue(museum);

      await sut.create({ name: 'Small', slug: 'small' });

      expect(repo.create).toHaveBeenCalledWith({
        name: 'Small',
        slug: 'small',
        address: null,
        description: null,
        latitude: null,
        longitude: null,
        config: {},
      });
    });

    it('throws conflict on duplicate slug (23505)', async () => {
      repo.create.mockReturnValue(makeMuseum());
      const pgError = new Error('unique_violation') as Error & { code: string };
      pgError.code = '23505';
      repo.save.mockRejectedValue(pgError);

      await expect(sut.create({ name: 'Dup', slug: 'louvre' })).rejects.toThrow(AppError);
      await expect(sut.create({ name: 'Dup', slug: 'louvre' })).rejects.toMatchObject({
        statusCode: 409,
      });
    });

    it('rethrows non-duplicate errors', async () => {
      repo.create.mockReturnValue(makeMuseum());
      repo.save.mockRejectedValue(new Error('DB connection lost'));

      await expect(sut.create({ name: 'X', slug: 'x' })).rejects.toThrow('DB connection lost');
    });
  });

  // ─── update ───
  describe('update', () => {
    it('updates existing museum fields', async () => {
      const existing = makeMuseum();
      repo.findOne.mockResolvedValue(existing);
      repo.save.mockResolvedValue({ ...existing, name: 'Updated' } as Museum);

      const result = await sut.update(1, { name: 'Updated' });

      expect(existing.name).toBe('Updated');
      expect(repo.save).toHaveBeenCalledWith(existing);
      expect(result).toBeDefined();
    });

    it('returns null when museum not found', async () => {
      repo.findOne.mockResolvedValue(null);

      const result = await sut.update(999, { name: 'Nope' });

      expect(result).toBeNull();
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('applies all provided update fields', async () => {
      const existing = makeMuseum();
      repo.findOne.mockResolvedValue(existing);
      repo.save.mockResolvedValue(existing);

      await sut.update(1, {
        name: 'New',
        slug: 'new-slug',
        address: 'New Address',
        description: 'New Desc',
        latitude: 1.0,
        longitude: 2.0,
        config: { theme: 'dark' },
        isActive: false,
      });

      expect(existing.name).toBe('New');
      expect(existing.slug).toBe('new-slug');
      expect(existing.address).toBe('New Address');
      expect(existing.description).toBe('New Desc');
      expect(existing.latitude).toBe(1.0);
      expect(existing.longitude).toBe(2.0);
      expect(existing.config).toEqual({ theme: 'dark' });
      expect(existing.isActive).toBe(false);
    });

    it('throws conflict on duplicate slug during update', async () => {
      const existing = makeMuseum();
      repo.findOne.mockResolvedValue(existing);
      const pgError = new Error('unique_violation') as Error & { code: string };
      pgError.code = '23505';
      repo.save.mockRejectedValue(pgError);

      await expect(sut.update(1, { slug: 'taken-slug' })).rejects.toThrow(AppError);
    });
  });

  // ─── findById ───
  describe('findById', () => {
    it('returns museum when found', async () => {
      const museum = makeMuseum();
      repo.findOne.mockResolvedValue(museum);

      const result = await sut.findById(1);

      expect(result).toBe(museum);
      expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
    });

    it('returns null when not found', async () => {
      repo.findOne.mockResolvedValue(null);

      const result = await sut.findById(999);

      expect(result).toBeNull();
    });
  });

  // ─── findBySlug ───
  describe('findBySlug', () => {
    it('returns museum when found by slug', async () => {
      const museum = makeMuseum();
      repo.findOne.mockResolvedValue(museum);

      const result = await sut.findBySlug('louvre');

      expect(result).toBe(museum);
      expect(repo.findOne).toHaveBeenCalledWith({ where: { slug: 'louvre' } });
    });

    it('returns null when slug not found', async () => {
      repo.findOne.mockResolvedValue(null);

      const result = await sut.findBySlug('nonexistent');

      expect(result).toBeNull();
    });
  });

  // ─── findAll ───
  describe('findAll', () => {
    it('returns all museums ordered by name', async () => {
      const museums = [makeMuseum({ id: 1, name: 'A' }), makeMuseum({ id: 2, name: 'B' })];
      repo.find.mockResolvedValue(museums);

      const result = await sut.findAll();

      expect(result).toBe(museums);
      expect(repo.find).toHaveBeenCalledWith({
        where: {},
        order: { name: 'ASC' },
      });
    });

    it('filters to active-only when requested', async () => {
      repo.find.mockResolvedValue([]);

      await sut.findAll({ activeOnly: true });

      expect(repo.find).toHaveBeenCalledWith({
        where: { isActive: true },
        order: { name: 'ASC' },
      });
    });

    it('returns all including inactive when activeOnly is false', async () => {
      repo.find.mockResolvedValue([]);

      await sut.findAll({ activeOnly: false });

      expect(repo.find).toHaveBeenCalledWith({
        where: {},
        order: { name: 'ASC' },
      });
    });
  });

  // ─── delete ───
  describe('delete', () => {
    it('deletes museum by id', async () => {
      repo.delete.mockResolvedValue({ affected: 1, raw: [] });

      await sut.delete(1);

      expect(repo.delete).toHaveBeenCalledWith(1);
    });
  });
});
