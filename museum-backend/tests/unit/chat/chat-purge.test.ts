import { ChatMessage } from '@modules/chat/domain/chatMessage.entity';
import { ChatSession } from '@modules/chat/domain/chatSession.entity';
import { runChatPurge } from '@modules/chat/jobs/chat-purge.job';

import { makeMessage, makeSession } from 'tests/helpers/chat/message.fixtures';
import { makeMockQb } from 'tests/helpers/shared/mock-query-builder';

import type { DataSource } from 'typeorm';

// ─── Mock harness ─────────────────────────────────────────────────────
//
// The purge job reaches into TypeORM via three distinct paths:
//   1. `sessionRepo.createQueryBuilder('session')` — candidate lookup
//   2. `manager.getRepository(ChatMessage).createQueryBuilder().delete()…` — purge
//   3. `manager.getRepository(ChatSession).createQueryBuilder().update()…` — flag
//
// We build one reusable query-builder per concern and wire `getRepository` to
// return the matching mock based on the entity class handed to it.

interface PurgeMocks {
  dataSource: DataSource;
  selectQb: ReturnType<typeof makeMockQb>;
  deleteQb: ReturnType<typeof makeMockQb>;
  updateQb: ReturnType<typeof makeMockQb>;
}

function buildMocks(candidateIds: string[], deleteAffected = 0): PurgeMocks {
  const selectQb = makeMockQb({
    getRawMany: jest.fn().mockResolvedValue(candidateIds.map((id) => ({ id }))),
  });
  const deleteQb = makeMockQb({
    execute: jest.fn().mockResolvedValue({ affected: deleteAffected }),
  });
  const updateQb = makeMockQb({
    execute: jest.fn().mockResolvedValue({ affected: 1 }),
  });

  const sessionRepo = { createQueryBuilder: jest.fn(() => selectQb) };
  const txMessageRepo = { createQueryBuilder: jest.fn(() => deleteQb) };
  const txSessionRepo = { createQueryBuilder: jest.fn(() => updateQb) };

  const txManager = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === ChatMessage) return txMessageRepo;
      if (entity === ChatSession) return txSessionRepo;
      throw new Error('Unexpected entity in transaction.getRepository');
    }),
  };

  const dataSource = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === ChatSession) return sessionRepo;
      throw new Error('Unexpected entity in dataSource.getRepository');
    }),
    transaction: jest.fn(async (cb: (manager: unknown) => Promise<void>) => cb(txManager)),
  } as unknown as DataSource;

  return { dataSource, selectQb, deleteQb, updateQb };
}

// ─── Tests ────────────────────────────────────────────────────────────

describe('runChatPurge', () => {
  beforeEach(() => jest.clearAllMocks());

  it('purges messages and flags the session when it is older than the retention window', async () => {
    const staleSession = makeSession({
      id: 'stale-session-id',
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    });
    // Factory reference kept to document the scenario — the delete path is
    // asserted through the mocked query builder.
    void makeMessage({ session: staleSession });

    const { dataSource, selectQb, deleteQb, updateQb } = buildMocks([staleSession.id], 3);

    const result = await runChatPurge(dataSource, { retentionDays: 180, batchSize: 50 });

    // Candidate query honours the retention window + purged-at filter.
    expect(selectQb.where).toHaveBeenCalledWith('session.purgedAt IS NULL');
    expect(selectQb.andWhere).toHaveBeenCalledWith(
      expect.stringContaining("session.updatedAt < NOW() - INTERVAL '180 days'"),
    );
    expect(selectQb.limit).toHaveBeenCalledWith(50);

    // Messages purged for the stale session.
    expect(deleteQb.delete).toHaveBeenCalled();
    expect(deleteQb.where).toHaveBeenCalledWith('sessionId = :id', { id: staleSession.id });
    expect(deleteQb.execute).toHaveBeenCalledTimes(1);

    // Session flagged as purged.
    expect(updateQb.update).toHaveBeenCalled();
    expect(updateQb.set).toHaveBeenCalledWith(
      expect.objectContaining({ purgedAt: expect.any(Function) as unknown }),
    );
    expect(updateQb.where).toHaveBeenCalledWith('id = :id', { id: staleSession.id });

    expect(result).toEqual({ purgedSessions: 1, purgedMessages: 3 });
  });

  it('leaves fresh sessions untouched when none fall past the retention window', async () => {
    const freshSession = makeSession({
      id: 'fresh-session-id',
      updatedAt: new Date(),
    });
    void freshSession;

    const { dataSource, deleteQb, updateQb } = buildMocks([]);

    const result = await runChatPurge(dataSource, { retentionDays: 180 });

    expect(deleteQb.execute).not.toHaveBeenCalled();
    expect(updateQb.execute).not.toHaveBeenCalled();
    expect(result).toEqual({ purgedSessions: 0, purgedMessages: 0 });
  });

  it('is idempotent — sessions already purged are filtered by the WHERE clause and skipped', async () => {
    const alreadyPurgedSession = makeSession({
      id: 'purged-session-id',
      updatedAt: new Date('2023-01-01T00:00:00.000Z'),
      purgedAt: new Date('2023-07-01T00:00:00.000Z'),
    });
    void alreadyPurgedSession;

    // The candidate query lists zero rows because `purgedAt IS NULL` is false.
    const { dataSource, selectQb, deleteQb, updateQb } = buildMocks([]);

    const result = await runChatPurge(dataSource);

    expect(selectQb.where).toHaveBeenCalledWith('session.purgedAt IS NULL');
    expect(deleteQb.execute).not.toHaveBeenCalled();
    expect(updateQb.execute).not.toHaveBeenCalled();
    expect(result).toEqual({ purgedSessions: 0, purgedMessages: 0 });
  });
});
