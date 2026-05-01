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
  it('upsert executes atomic INSERT ON CONFLICT query', async () => {
    const { repository, repo } = createRepository();
    const mockRow = {
      id: 'uuid-1',
      keyword: 'ceramics',
      locale: 'en',
      hitCount: 1,
      category: 'general',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as ArtKeyword;
    repo.query.mockResolvedValue([mockRow]);

    const result = await repository.upsert('ceramics', 'en');

    expect(repo.query).toHaveBeenCalledTimes(1);
    const [sql, params] = (repo.query as jest.Mock).mock.calls[0] as [string, string[]];
    expect(sql).toContain('INSERT INTO "art_keywords"');
    expect(sql).toContain('ON CONFLICT ("keyword", "locale")');
    expect(sql).toContain('"hitCount" = "art_keywords"."hitCount" + 1');
    expect(sql).toContain('RETURNING *');
    expect(params).toEqual(['ceramics', 'en']);
    expect(result).toBe(mockRow);
  });

  it('upsert normalizes keyword to lowercase trimmed before SQL', async () => {
    const { repository, repo } = createRepository();
    repo.query.mockResolvedValue([{ keyword: 'mosaic', locale: 'fr', hitCount: 1 } as ArtKeyword]);

    await repository.upsert('  MOSAIC  ', 'fr');

    const [, params] = (repo.query as jest.Mock).mock.calls[0] as [string, string[]];
    expect(params[0]).toBe('mosaic');
    expect(params[1]).toBe('fr');
  });

  it('upsert does not call findOne or save (no read-modify-write)', async () => {
    const { repository, repo } = createRepository();
    repo.query.mockResolvedValue([{ keyword: 'fresco', locale: 'en', hitCount: 2 } as ArtKeyword]);

    await repository.upsert('fresco', 'en');

    expect(repo.findOne).not.toHaveBeenCalled();
    expect(repo.save).not.toHaveBeenCalled();
    expect(repo.create).not.toHaveBeenCalled();
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
