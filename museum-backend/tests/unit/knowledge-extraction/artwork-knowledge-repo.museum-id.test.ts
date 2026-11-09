import { makeMockQb } from 'tests/helpers/shared/mock-query-builder';

import { TypeOrmArtworkKnowledgeRepo } from '@modules/knowledge-extraction/adapters/secondary/pg/typeorm-artwork-knowledge.repo';

import type { ArtworkKnowledge } from '@modules/knowledge-extraction/domain/artwork-knowledge/artwork-knowledge.entity';
import type { Repository } from 'typeorm';

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const { logger: mockLogger } = require('@shared/logger/logger') as {
  logger: { warn: jest.Mock; info: jest.Mock; error: jest.Mock };
};

const ARTWORK_UUID = '00000000-0000-4000-8000-0000000000aa';
const TENANT_A = 42;

type ScopedFindById = (id: string, museumId?: number | null) => Promise<ArtworkKnowledge | null>;

function buildRepoMock(): {
  repo: Repository<ArtworkKnowledge>;
  qb: Record<string, jest.Mock>;
} {
  const qb = makeMockQb();
  const repo = {
    findOne: jest.fn().mockResolvedValue(null),
    createQueryBuilder: jest.fn().mockReturnValue(qb),
  } as unknown as Repository<ArtworkKnowledge>;
  return { repo, qb };
}

describe('TypeOrmArtworkKnowledgeRepo.findById — OWASP LLM08 museum_id scope (I-SEC8)', () => {
  beforeEach(() => {
    mockLogger.warn.mockClear();
  });

  it('routes through a QueryBuilder whose tenant predicate carries museum_id + :museumId bind when museumId is set, with no warn (AC-1/AC-2/AC-3)', async () => {
    const { repo, qb } = buildRepoMock();
    const sut = new TypeOrmArtworkKnowledgeRepo(repo);
    const findById: ScopedFindById = sut.findById.bind(sut);

    await findById(ARTWORK_UUID, TENANT_A);

    const andWhereCalls: [string, Record<string, unknown>][] = qb.andWhere.mock.calls;
    expect(andWhereCalls.length).toBeGreaterThan(0);
    const tenantClause = andWhereCalls.find(([sql]) => sql.includes(':museumId'));
    expect(tenantClause).toBeDefined();
    const [predicateSql, binds] = tenantClause!;
    expect(predicateSql).toContain('museum_id');
    expect(predicateSql).toContain('museum_id IS NULL');
    expect(binds.museumId).toBe(TENANT_A);
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it('binds null and emits the stable unscoped warn exactly once when museumId is omitted (AC-4)', async () => {
    const { repo, qb } = buildRepoMock();
    const sut = new TypeOrmArtworkKnowledgeRepo(repo);
    const findById: ScopedFindById = sut.findById.bind(sut);

    await findById(ARTWORK_UUID);

    const andWhereCalls: [string, Record<string, unknown>][] = qb.andWhere.mock.calls;
    const tenantClause = andWhereCalls.find(([sql]) => sql.includes(':museumId'));
    expect(tenantClause).toBeDefined();
    const [, binds] = tenantClause!;
    expect(binds.museumId).toBeNull();

    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    const [event] = mockLogger.warn.mock.calls[0] as [string, Record<string, unknown>];
    expect(event).toBe('artwork_knowledge_find_by_id_unscoped');
  });

  it('treats explicit null museumId as omitted: null bind + warn once (AC-4)', async () => {
    const { repo, qb } = buildRepoMock();
    const sut = new TypeOrmArtworkKnowledgeRepo(repo);
    const findById: ScopedFindById = sut.findById.bind(sut);

    await findById(ARTWORK_UUID, null);

    const andWhereCalls: [string, Record<string, unknown>][] = qb.andWhere.mock.calls;
    const tenantClause = andWhereCalls.find(([sql]) => sql.includes(':museumId'));
    expect(tenantClause).toBeDefined();
    const [, binds] = tenantClause!;
    expect(binds.museumId).toBeNull();
    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
  });
});
