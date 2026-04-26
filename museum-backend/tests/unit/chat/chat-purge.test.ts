import { ChatMessage } from '@modules/chat/domain/chatMessage.entity';
import { ChatSession } from '@modules/chat/domain/chatSession.entity';
import { runChatPurge } from '@modules/chat/jobs/chat-purge.job';

import { makeMessage, makeSession } from 'tests/helpers/chat/message.fixtures';
import { makeMockQb } from 'tests/helpers/shared/mock-query-builder';

import type { ChatMediaPurger } from '@modules/chat/jobs/chat-media-purger';
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
  mediaQb: ReturnType<typeof makeMockQb>;
  deleteQb: ReturnType<typeof makeMockQb>;
  updateQb: ReturnType<typeof makeMockQb>;
}

interface BuildMocksOpts {
  candidateIds?: string[];
  deleteAffected?: number;
  /** Rows returned by the imageRef/audioUrl SELECT query for each session. */
  mediaRefsBySession?: Record<string, { imageRef?: string | null; audioUrl?: string | null }[]>;
}

function buildMocks(opts: BuildMocksOpts = {}): PurgeMocks {
  const candidateIds = opts.candidateIds ?? [];
  const deleteAffected = opts.deleteAffected ?? 0;
  const mediaRefsBySession = opts.mediaRefsBySession ?? {};

  const selectQb = makeMockQb({
    getRawMany: jest.fn().mockResolvedValue(candidateIds.map((id) => ({ id }))),
  });
  const mediaQb = makeMockQb();
  // The media query calls .where('msg.sessionId = :id', { id }) — capture the
  // id and serve the matching seed rows (or [] when none registered).
  let lastSessionId: string | undefined;
  mediaQb.where.mockImplementation((..._args: unknown[]) => {
    const arg = _args[1] as { id?: string } | undefined;
    if (arg?.id) lastSessionId = arg.id;
    return mediaQb;
  });
  mediaQb.getRawMany.mockImplementation(() => {
    return Promise.resolve(lastSessionId ? (mediaRefsBySession[lastSessionId] ?? []) : []);
  });

  const deleteQb = makeMockQb({
    execute: jest.fn().mockResolvedValue({ affected: deleteAffected }),
  });
  const updateQb = makeMockQb({
    execute: jest.fn().mockResolvedValue({ affected: 1 }),
  });

  const sessionRepo = { createQueryBuilder: jest.fn(() => selectQb) };
  const messageRepo = { createQueryBuilder: jest.fn(() => mediaQb) };
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
      if (entity === ChatMessage) return messageRepo;
      throw new Error('Unexpected entity in dataSource.getRepository');
    }),
    transaction: jest.fn(async (cb: (manager: unknown) => Promise<void>) => cb(txManager)),
  } as unknown as DataSource;

  return { dataSource, selectQb, mediaQb, deleteQb, updateQb };
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

    const { dataSource, selectQb, deleteQb, updateQb } = buildMocks({
      candidateIds: [staleSession.id],
      deleteAffected: 3,
    });

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

    expect(result).toEqual({
      purgedSessions: 1,
      purgedMessages: 3,
      purgedMedia: 0,
      failedMedia: 0,
      skippedMedia: 0,
    });
  });

  it('leaves fresh sessions untouched when none fall past the retention window', async () => {
    const freshSession = makeSession({
      id: 'fresh-session-id',
      updatedAt: new Date(),
    });
    void freshSession;

    const { dataSource, deleteQb, updateQb } = buildMocks({ candidateIds: [] });

    const result = await runChatPurge(dataSource, { retentionDays: 180 });

    expect(deleteQb.execute).not.toHaveBeenCalled();
    expect(updateQb.execute).not.toHaveBeenCalled();
    expect(result).toEqual({
      purgedSessions: 0,
      purgedMessages: 0,
      purgedMedia: 0,
      failedMedia: 0,
      skippedMedia: 0,
    });
  });

  it('is idempotent — sessions already purged are filtered by the WHERE clause and skipped', async () => {
    const alreadyPurgedSession = makeSession({
      id: 'purged-session-id',
      updatedAt: new Date('2023-01-01T00:00:00.000Z'),
      purgedAt: new Date('2023-07-01T00:00:00.000Z'),
    });
    void alreadyPurgedSession;

    // The candidate query lists zero rows because `purgedAt IS NULL` is false.
    const { dataSource, selectQb, deleteQb, updateQb } = buildMocks({ candidateIds: [] });

    const result = await runChatPurge(dataSource);

    expect(selectQb.where).toHaveBeenCalledWith('session.purgedAt IS NULL');
    expect(deleteQb.execute).not.toHaveBeenCalled();
    expect(updateQb.execute).not.toHaveBeenCalled();
    expect(result).toEqual({
      purgedSessions: 0,
      purgedMessages: 0,
      purgedMedia: 0,
      failedMedia: 0,
      skippedMedia: 0,
    });
  });

  it('forwards every imageRef + audioUrl on a purged session to the media purger', async () => {
    const staleSession = makeSession({
      id: 'media-session',
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    });
    // Just to document intent — factory call, not asserted.
    void makeMessage({
      session: staleSession,
      imageRef: 's3://chat-images/user-1/2026/04/foo.jpg',
    });

    const { dataSource } = buildMocks({
      candidateIds: [staleSession.id],
      deleteAffected: 2,
      mediaRefsBySession: {
        [staleSession.id]: [
          { imageRef: 's3://chat-images/user-1/2026/04/foo.jpg', audioUrl: null },
          { imageRef: null, audioUrl: 's3://chat-audios/2026/04/bar.mp3' },
          { imageRef: 'https://images.unsplash.com/x.jpg', audioUrl: null },
        ],
      },
    });

    const deleteRefs = jest.fn().mockResolvedValue({
      deleted: ['chat-images/user-1/2026/04/foo.jpg', 'chat-audios/2026/04/bar.mp3'],
      failed: [],
      skipped: ['https://images.unsplash.com/x.jpg'],
    });
    const purger: ChatMediaPurger = { deleteRefs };

    const result = await runChatPurge(dataSource, { mediaPurger: purger });

    expect(deleteRefs).toHaveBeenCalledTimes(1);
    expect(deleteRefs).toHaveBeenCalledWith([
      's3://chat-images/user-1/2026/04/foo.jpg',
      's3://chat-audios/2026/04/bar.mp3',
      'https://images.unsplash.com/x.jpg',
    ]);
    expect(result.purgedMedia).toBe(2);
    expect(result.skippedMedia).toBe(1);
    expect(result.failedMedia).toBe(0);
    expect(result.purgedSessions).toBe(1);
    expect(result.purgedMessages).toBe(2);
  });

  it('keeps purging the DB even when the media purger throws (S3 outage path)', async () => {
    const staleSession = makeSession({
      id: 'media-throw-session',
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    });
    void staleSession;

    const { dataSource } = buildMocks({
      candidateIds: [staleSession.id],
      deleteAffected: 1,
      mediaRefsBySession: {
        [staleSession.id]: [{ imageRef: 's3://chat-images/x.jpg', audioUrl: null }],
      },
    });

    const purger: ChatMediaPurger = {
      deleteRefs: jest.fn().mockRejectedValue(new Error('S3 ECONNREFUSED')),
    };

    const result = await runChatPurge(dataSource, { mediaPurger: purger });

    expect(result.purgedSessions).toBe(1);
    expect(result.purgedMessages).toBe(1);
    expect(result.purgedMedia).toBe(0);
    expect(result.failedMedia).toBe(1);
  });

  it('counts partial S3 failures via the purger result without aborting the tick', async () => {
    const staleSession = makeSession({
      id: 'media-partial-session',
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    });
    void staleSession;

    const { dataSource } = buildMocks({
      candidateIds: [staleSession.id],
      deleteAffected: 2,
      mediaRefsBySession: {
        [staleSession.id]: [
          { imageRef: 's3://chat-images/ok.jpg', audioUrl: null },
          { imageRef: null, audioUrl: 's3://chat-audios/fail.mp3' },
        ],
      },
    });

    const deleteRefs = jest.fn().mockResolvedValue({
      deleted: ['chat-images/ok.jpg'],
      failed: [{ ref: 's3://chat-audios/fail.mp3', reason: 'AccessDenied' }],
      skipped: [],
    });
    const purger: ChatMediaPurger = { deleteRefs };

    const result = await runChatPurge(dataSource, { mediaPurger: purger });

    expect(result.purgedSessions).toBe(1);
    expect(result.purgedMedia).toBe(1);
    expect(result.failedMedia).toBe(1);
  });

  it('skips media-purger calls entirely when a session has no media refs', async () => {
    const staleSession = makeSession({
      id: 'no-media-session',
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    });
    void staleSession;

    const { dataSource } = buildMocks({
      candidateIds: [staleSession.id],
      deleteAffected: 1,
      mediaRefsBySession: {
        [staleSession.id]: [], // no rows with imageRef/audioUrl
      },
    });

    const deleteRefs = jest.fn();
    const purger: ChatMediaPurger = { deleteRefs };

    const result = await runChatPurge(dataSource, { mediaPurger: purger });

    expect(deleteRefs).not.toHaveBeenCalled();
    expect(result.purgedSessions).toBe(1);
    expect(result.purgedMedia).toBe(0);
  });
});
