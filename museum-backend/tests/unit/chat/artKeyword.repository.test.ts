import { TypeOrmArtKeywordRepository } from '@modules/chat/adapters/secondary/artKeyword.repository.typeorm';
import { ArtKeyword } from '@modules/chat/domain/artKeyword.entity';
import { makeMockQb } from 'tests/helpers/shared/mock-query-builder';

import type { Repository } from 'typeorm';

const createMockRepo = () => {
  const mockQb = makeMockQb();

  const repo: jest.Mocked<Repository<ArtKeyword>> = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    save: jest
      .fn()
      .mockImplementation((entity) =>
        Promise.resolve({ id: 'uuid-1', createdAt: new Date(), updatedAt: new Date(), ...entity }),
      ),
    create: jest.fn().mockImplementation((data) => data),
    createQueryBuilder: jest.fn().mockReturnValue(mockQb),
    query: jest.fn().mockResolvedValue([]),
  } as unknown as jest.Mocked<Repository<ArtKeyword>>;

  return { repo, mockQb };
};

const createRepository = () => {
  const { repo, mockQb } = createMockRepo();
  const mockDataSource = {
    getRepository: jest.fn().mockReturnValue(repo),
  };
  const repository = new TypeOrmArtKeywordRepository(mockDataSource as never);
  return { repository, repo, mockQb };
};

describe('TypeOrmArtKeywordRepository', () => {
  it('upsert creates new keyword when not existing', async () => {
    const { repository, repo } = createRepository();
    repo.findOne.mockResolvedValue(null);

    await repository.upsert('ceramics', 'en');

    expect(repo.create).toHaveBeenCalledWith({ keyword: 'ceramics', locale: 'en', hitCount: 1 });
    expect(repo.save).toHaveBeenCalled();
  });

  it('upsert increments hitCount for existing keyword', async () => {
    const { repository, repo } = createRepository();
    const existing = {
      id: 'uuid-1',
      keyword: 'ceramics',
      locale: 'en',
      hitCount: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as ArtKeyword;
    repo.findOne.mockResolvedValue(existing);

    await repository.upsert('Ceramics', 'en');

    expect(existing.hitCount).toBe(4);
    expect(repo.save).toHaveBeenCalledWith(existing);
  });

  it('upsert normalizes keyword to lowercase trimmed', async () => {
    const { repository, repo } = createRepository();

    await repository.upsert('  MOSAIC  ', 'fr');

    expect(repo.findOne).toHaveBeenCalledWith({ where: { keyword: 'mosaic', locale: 'fr' } });
  });

  it('findByLocale with wildcard returns all', async () => {
    const { repository, repo } = createRepository();
    const kws = [{ keyword: 'a' }, { keyword: 'b' }] as ArtKeyword[];
    repo.find.mockResolvedValue(kws);

    const result = await repository.findByLocale('%');

    expect(repo.find).toHaveBeenCalledWith({ order: { hitCount: 'DESC' } });
    expect(result).toEqual(kws);
  });

  it('findByLocaleSince filters by date and locale', async () => {
    const { repository, mockQb } = createRepository();
    const since = new Date('2026-01-01');

    await repository.findByLocaleSince('fr', since);

    expect(mockQb.where).toHaveBeenCalledWith('kw.updatedAt > :since', { since });
    expect(mockQb.andWhere).toHaveBeenCalledWith('kw.locale = :locale', { locale: 'fr' });
    expect(mockQb.getMany).toHaveBeenCalled();
  });

  it('bulkUpsert executes single INSERT ON CONFLICT query', async () => {
    const { repository, repo } = createRepository();

    await repository.bulkUpsert(['mosaic', 'fresco', 'mosaic'], 'en');

    // Deduplicated: mosaic + fresco = 2 unique
    expect(repo.query).toHaveBeenCalledTimes(1);
    const [sql, params] = (repo.query as jest.Mock).mock.calls[0];
    expect(sql).toContain('INSERT INTO "art_keywords"');
    expect(sql).toContain('ON CONFLICT');
    expect(sql).toContain('"updatedAt" = NOW()');
    expect(params).toEqual(['mosaic', 'en', 'fresco', 'en']);
  });
});
