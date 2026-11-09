import { UserMemory } from '@modules/chat/domain/memory/userMemory.entity';
import { TypeOrmUserMemoryRepository } from '@modules/chat/adapters/secondary/persistence/userMemory.repository.typeorm';
import { makeMockQb } from 'tests/helpers/shared/mock-query-builder';
import { makeMockTypeOrmRepo, makeMockDataSource } from 'tests/helpers/shared/mock-deps';
import { makeMemory } from 'tests/helpers/chat/userMemory.fixtures';

const USER_MEMORY_COLUMN_MAP: Record<string, string> = {
  userId: 'user_id',
  preferredExpertise: 'preferredExpertise',
  totalArtworksDiscussed: 'totalArtworksDiscussed',
  sessionCount: 'sessionCount',
  lastSessionId: 'lastSessionId',
};

function buildMocks() {
  const qb = makeMockQb({ execute: jest.fn().mockResolvedValue({}) });
  const { repo } = makeMockTypeOrmRepo<UserMemory>({ qb, columnMap: USER_MEMORY_COLUMN_MAP });
  const dataSource = makeMockDataSource(repo);
  return { repo, qb, dataSource };
}

describe('TypeOrmUserMemoryRepository.upsert() — single SQL round-trip', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls execute() exactly once (single SQL round-trip)', async () => {
    const { repo, qb, dataSource } = buildMocks();
    const memory = makeMemory({ userId: 1 });
    repo.findOne.mockResolvedValue(memory);

    const sut = new TypeOrmUserMemoryRepository(dataSource);
    await sut.upsert(1, { preferredExpertise: 'expert' });

    expect(qb.execute).toHaveBeenCalledTimes(1);
  });

  it('uses orUpdate (ON CONFLICT path) — not a bare INSERT', async () => {
    const { repo, qb, dataSource } = buildMocks();
    repo.findOne.mockResolvedValue(makeMemory({ userId: 2 }));

    const sut = new TypeOrmUserMemoryRepository(dataSource);
    await sut.upsert(2, { sessionCount: 5, lastSessionId: 'sess-abc' });

    expect(qb.orUpdate).toHaveBeenCalledWith(
      expect.arrayContaining(['sessionCount', 'lastSessionId']),
      ['user_id'],
    );
  });

  it('does NOT call repo.save() — no separate read-modify-write cycle', async () => {
    const { repo, qb, dataSource } = buildMocks();
    repo.findOne.mockResolvedValue(makeMemory({ userId: 3 }));

    const sut = new TypeOrmUserMemoryRepository(dataSource);
    await sut.upsert(3, { totalArtworksDiscussed: 7 });

    expect(repo.save).not.toHaveBeenCalled();
    expect(qb.execute).toHaveBeenCalledTimes(1);
  });
});
