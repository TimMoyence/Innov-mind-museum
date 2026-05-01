/**
 * Guard test: UserMemory.upsert() is a single SQL round-trip.
 *
 * Asserts that upsert() calls query-builder `.execute()` exactly ONCE,
 * meaning it is a single atomic INSERT … ON CONFLICT … DO UPDATE — not
 * two separate SELECT + INSERT/UPDATE calls that would expose a TOCTOU race.
 *
 * Also asserts the query hits the ON CONFLICT path (orUpdate) so concurrent
 * callers are serialised at the Postgres row level.
 */

import { UserMemory } from '@modules/chat/domain/userMemory.entity';
import { TypeOrmUserMemoryRepository } from '@modules/chat/adapters/secondary/userMemory.repository.typeorm';
import { makeMockQb } from 'tests/helpers/shared/mock-query-builder';
import { makeMockTypeOrmRepo, makeMockDataSource } from 'tests/helpers/shared/mock-deps';
import { makeMemory } from 'tests/helpers/chat/userMemory.fixtures';

// ── Helpers ───────────────────────────────────────────────────────────────

function buildMocks() {
  const qb = makeMockQb({ execute: jest.fn().mockResolvedValue({}) });
  const { repo } = makeMockTypeOrmRepo<UserMemory>({ qb });
  const dataSource = makeMockDataSource(repo);
  return { repo, qb, dataSource };
}

// ── Tests ─────────────────────────────────────────────────────────────────

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
      expect.arrayContaining(['session_count', 'last_session_id']),
      ['user_id'],
    );
  });

  it('does NOT call repo.save() — no separate read-modify-write cycle', async () => {
    const { repo, qb, dataSource } = buildMocks();
    repo.findOne.mockResolvedValue(makeMemory({ userId: 3 }));

    const sut = new TypeOrmUserMemoryRepository(dataSource);
    await sut.upsert(3, { totalArtworksDiscussed: 7 });

    expect(repo.save).not.toHaveBeenCalled();
    // execute() still fires exactly once
    expect(qb.execute).toHaveBeenCalledTimes(1);
  });
});
