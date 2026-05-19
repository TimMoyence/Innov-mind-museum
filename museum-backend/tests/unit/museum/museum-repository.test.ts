import type { Repository } from 'typeorm';

import { Museum } from '@modules/museum/domain/museum/museum.entity';
import { AppError } from '@shared/errors/app.error';

import {
  MuseumRepositoryPg,
  _resetGeofenceModeCacheForTests,
} from '@modules/museum/adapters/secondary/pg/museum.repository.pg';
import { makeMuseum } from 'tests/helpers/museum/museum.fixtures';
import { makeMockTypeOrmRepo, makeMockDataSource } from 'tests/helpers/shared/mock-deps';

// T3.4 (2026-05-16) — Local makeMuseum() removed: replaced by the shared factory
// at tests/helpers/museum/museum.fixtures.ts, which uses Object.assign(new Museum(), ...)
// instead of an `as Museum` cast and gives every test the same default shape.

function buildMocks() {
  const { repo } = makeMockTypeOrmRepo<Museum>();
  const dataSource = makeMockDataSource(repo);
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
      repo.save.mockResolvedValue(makeMuseum({ ...existing, name: 'Updated' }));

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

  // ─── findByCoords (W3 geofence containment) ───
  describe('findByCoords', () => {
    beforeEach(() => {
      _resetGeofenceModeCacheForTests();
    });

    it('returns null when neither geofence nor geofence_bbox column is present', async () => {
      const ds = makeMockDataSource(repo);
      (ds.query as jest.Mock).mockResolvedValueOnce([]); // information_schema lookup
      sut = new MuseumRepositoryPg(ds);

      const result = await sut.findByCoords(48.86, 2.34);

      expect(result).toBeNull();
    });

    it('PostGIS path — runs ST_Contains and returns matched museum', async () => {
      const ds = makeMockDataSource(repo);
      (ds.query as jest.Mock)
        .mockResolvedValueOnce([{ column_name: 'geofence' }]) // schema introspect
        .mockResolvedValueOnce([{ id: 42 }]); // ST_Contains hit
      const matched = makeMuseum({ id: 42, name: 'Louvre' });
      repo.findOne.mockResolvedValue(matched);
      sut = new MuseumRepositoryPg(ds);

      const result = await sut.findByCoords(48.8606, 2.3376);

      expect(result).toBe(matched);
      const queries = (ds.query as jest.Mock).mock.calls.map((c: unknown[]) => String(c[0]));
      expect(queries.some((q) => q.includes('ST_Contains'))).toBe(true);
    });

    it('PostGIS path — returns null when no polygon contains the point', async () => {
      const ds = makeMockDataSource(repo);
      (ds.query as jest.Mock)
        .mockResolvedValueOnce([{ column_name: 'geofence' }])
        .mockResolvedValueOnce([]); // no row
      sut = new MuseumRepositoryPg(ds);

      const result = await sut.findByCoords(0, 0);

      expect(result).toBeNull();
    });

    it('JSONB-bbox path — returns museum whose bbox contains the point', async () => {
      const ds = makeMockDataSource(repo);
      (ds.query as jest.Mock)
        .mockResolvedValueOnce([{ column_name: 'geofence_bbox' }])
        .mockResolvedValueOnce([
          {
            id: 7,
            geofence_bbox: { north: 48.87, south: 48.85, east: 2.35, west: 2.33 },
          },
        ]);
      const matched = makeMuseum({ id: 7 });
      repo.findOne.mockResolvedValue(matched);
      sut = new MuseumRepositoryPg(ds);

      const result = await sut.findByCoords(48.86, 2.34);

      expect(result).toBe(matched);
    });

    it('JSONB-bbox path — returns null when point falls outside every bbox', async () => {
      const ds = makeMockDataSource(repo);
      (ds.query as jest.Mock)
        .mockResolvedValueOnce([{ column_name: 'geofence_bbox' }])
        .mockResolvedValueOnce([
          {
            id: 7,
            geofence_bbox: { north: 48.87, south: 48.85, east: 2.35, west: 2.33 },
          },
        ]);
      sut = new MuseumRepositoryPg(ds);

      const result = await sut.findByCoords(45.0, 5.0); // far outside Paris

      expect(result).toBeNull();
    });

    it('caches the mode pick across subsequent calls (no second information_schema hit)', async () => {
      const ds = makeMockDataSource(repo);
      (ds.query as jest.Mock)
        .mockResolvedValueOnce([{ column_name: 'geofence_bbox' }])
        .mockResolvedValue([]); // returns empty bbox list
      sut = new MuseumRepositoryPg(ds);

      await sut.findByCoords(48.86, 2.34);
      await sut.findByCoords(48.87, 2.35);

      const queries = (ds.query as jest.Mock).mock.calls.map((c: unknown[]) => String(c[0]));
      const schemaIntrospectionCalls = queries.filter((q) => q.includes('information_schema'));
      expect(schemaIntrospectionCalls).toHaveLength(1);
    });
  });
});
