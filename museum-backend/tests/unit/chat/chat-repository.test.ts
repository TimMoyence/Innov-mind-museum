import type { DataSource, DeleteResult, Repository } from 'typeorm';

import { ChatMessage } from '@modules/chat/domain/chatMessage.entity';
import { ChatSession } from '@modules/chat/domain/chatSession.entity';
import { ArtworkMatch } from '@modules/chat/domain/artworkMatch.entity';
import { MessageReport } from '@modules/chat/domain/messageReport.entity';
import { MessageFeedback } from '@modules/chat/domain/messageFeedback.entity';

import { TypeOrmChatRepository } from '@modules/chat/infrastructure/chat.repository.typeorm';
import { makeSession, makeMessage } from 'tests/helpers/chat/message.fixtures';

// ─── QueryBuilder mock factory ───
function makeMockQb() {
  const qb: Record<string, jest.Mock> = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
    getOne: jest.fn(),
    getCount: jest.fn(),
    getManyAndCount: jest.fn(),
    leftJoin: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    addGroupBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn(),
    getRawOne: jest.fn(),
    execute: jest.fn(),
    insert: jest.fn().mockReturnThis(),
    into: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    orUpdate: jest.fn().mockReturnThis(),
    distinctOn: jest.fn().mockReturnThis(),
  };
  return qb;
}

function buildMocks() {
  const sessionQb = makeMockQb();
  const messageQb = makeMockQb();
  const feedbackQb = makeMockQb();

  const sessionRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    createQueryBuilder: jest.fn(() => sessionQb),
    manager: {
      transaction: jest.fn(),
    },
  } as unknown as jest.Mocked<Repository<ChatSession>>;

  const messageRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn(() => messageQb),
    manager: {
      transaction: jest.fn(),
    },
  } as unknown as jest.Mocked<Repository<ChatMessage>>;

  const reportRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    count: jest.fn(),
    delete: jest.fn(),
  } as unknown as jest.Mocked<Repository<MessageReport>>;

  const feedbackRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    createQueryBuilder: jest.fn(() => feedbackQb),
  } as unknown as jest.Mocked<Repository<MessageFeedback>>;

  const dataSource = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === ChatSession) return sessionRepo;
      if (entity === ChatMessage) return messageRepo;
      if (entity === MessageReport) return reportRepo;
      if (entity === MessageFeedback) return feedbackRepo;
      return sessionRepo;
    }),
  } as unknown as DataSource;

  return {
    sessionRepo,
    messageRepo,
    reportRepo,
    feedbackRepo,
    sessionQb,
    messageQb,
    feedbackQb,
    dataSource,
  };
}

describe('TypeOrmChatRepository', () => {
  let sut: TypeOrmChatRepository;
  let sessionRepo: jest.Mocked<Repository<ChatSession>>;
  let messageRepo: jest.Mocked<Repository<ChatMessage>>;
  let reportRepo: jest.Mocked<Repository<MessageReport>>;
  let feedbackRepo: jest.Mocked<Repository<MessageFeedback>>;
  let sessionQb: ReturnType<typeof makeMockQb>;
  let messageQb: ReturnType<typeof makeMockQb>;
  let feedbackQb: ReturnType<typeof makeMockQb>;

  beforeEach(() => {
    jest.clearAllMocks();
    const mocks = buildMocks();
    sessionRepo = mocks.sessionRepo;
    messageRepo = mocks.messageRepo;
    reportRepo = mocks.reportRepo;
    feedbackRepo = mocks.feedbackRepo;
    sessionQb = mocks.sessionQb;
    messageQb = mocks.messageQb;
    feedbackQb = mocks.feedbackQb;
    sut = new TypeOrmChatRepository(mocks.dataSource);
  });

  // ─── createSession ───
  describe('createSession', () => {
    it('creates and saves a session', async () => {
      const session = makeSession();
      sessionRepo.create.mockReturnValue(session);
      sessionRepo.save.mockResolvedValue(session);

      const result = await sut.createSession({
        locale: 'fr',
        museumMode: true,
        userId: 1,
      });

      expect(sessionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          locale: 'fr',
          museumMode: true,
          museumId: null,
        }),
      );
      expect(result).toBe(session);
    });

    it('handles empty locale as null', async () => {
      const session = makeSession({ locale: null });
      sessionRepo.create.mockReturnValue(session);
      sessionRepo.save.mockResolvedValue(session);

      await sut.createSession({ locale: '', museumMode: false });

      expect(sessionRepo.create).toHaveBeenCalledWith(expect.objectContaining({ locale: null }));
    });

    it('handles undefined userId', async () => {
      const session = makeSession();
      sessionRepo.create.mockReturnValue(session);
      sessionRepo.save.mockResolvedValue(session);

      await sut.createSession({ locale: 'en', museumMode: false });

      expect(sessionRepo.create).toHaveBeenCalledWith(expect.objectContaining({ user: null }));
    });
  });

  // ─── getSessionById ───
  describe('getSessionById', () => {
    it('returns session with user relation', async () => {
      const session = makeSession();
      sessionRepo.findOne.mockResolvedValue(session);

      const result = await sut.getSessionById('session-001');

      expect(sessionRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'session-001' },
        relations: { user: true },
      });
      expect(result).toBe(session);
    });

    it('returns null when not found', async () => {
      sessionRepo.findOne.mockResolvedValue(null);

      const result = await sut.getSessionById('nonexistent');

      expect(result).toBeNull();
    });
  });

  // ─── getMessageById ───
  describe('getMessageById', () => {
    it('returns message with session ownership info', async () => {
      const session = makeSession();
      const message = makeMessage({ session });
      messageRepo.findOne.mockResolvedValue(message);

      const result = await sut.getMessageById('msg-001');

      expect(messageRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'msg-001' },
        relations: { session: { user: true } },
      });
      expect(result).toEqual({ message, session });
    });

    it('returns null when message not found', async () => {
      messageRepo.findOne.mockResolvedValue(null);

      const result = await sut.getMessageById('nonexistent');

      expect(result).toBeNull();
    });

    it('returns null when message has no session', async () => {
      const message = makeMessage();
      // Simulate a message with no session
      const msgWithoutSession = { ...message, session: undefined } as unknown as ChatMessage;
      messageRepo.findOne.mockResolvedValue(msgWithoutSession);

      const result = await sut.getMessageById('msg-orphan');

      expect(result).toBeNull();
    });
  });

  // ─── deleteSessionIfEmpty ───
  describe('deleteSessionIfEmpty', () => {
    function setupTransactionMock(
      sessionFound: ChatSession | null,
      messageCount: number,
      deleteAffected: number,
    ) {
      const txSessionRepo = {
        findOne: jest.fn().mockResolvedValue(sessionFound),
        delete: jest.fn().mockResolvedValue({ affected: deleteAffected } as DeleteResult),
      };

      const txMsgQb = makeMockQb();
      txMsgQb.getCount.mockResolvedValue(messageCount);

      const txMessageRepo = {
        createQueryBuilder: jest.fn(() => txMsgQb),
      };

      (sessionRepo.manager.transaction as jest.Mock).mockImplementation(
        (cb: (manager: { getRepository: (e: unknown) => unknown }) => Promise<boolean>) =>
          cb({
            getRepository: (entity: unknown) => {
              if (entity === ChatSession) return txSessionRepo;
              if (entity === ChatMessage) return txMessageRepo;
              return txSessionRepo;
            },
          }),
      );

      return { txSessionRepo, txMsgQb };
    }

    it('deletes empty session and returns true', async () => {
      const session = makeSession();
      setupTransactionMock(session, 0, 1);

      const result = await sut.deleteSessionIfEmpty('session-001');

      expect(result).toBe(true);
    });

    it('returns false when session has messages', async () => {
      const session = makeSession();
      setupTransactionMock(session, 3, 0);

      const result = await sut.deleteSessionIfEmpty('session-001');

      expect(result).toBe(false);
    });

    it('returns false when session not found', async () => {
      setupTransactionMock(null, 0, 0);

      const result = await sut.deleteSessionIfEmpty('nonexistent');

      expect(result).toBe(false);
    });
  });

  // ─── persistMessage ───
  describe('persistMessage', () => {
    function setupPersistTransaction(opts: {
      savedMessage?: ChatMessage;
      session?: ChatSession | null;
    }) {
      const savedMsg = opts.savedMessage ?? makeMessage({ id: 'new-msg' });
      const session = opts.session !== undefined ? opts.session : makeSession();

      const txMessageRepo = {
        create: jest.fn().mockReturnValue(savedMsg),
        save: jest.fn().mockResolvedValue(savedMsg),
      };
      const txSessionRepo = {
        findOneBy: jest.fn().mockResolvedValue(session),
        save: jest.fn().mockResolvedValue(session),
      };
      const txArtworkRepo = {
        create: jest.fn().mockReturnValue({}),
        save: jest.fn().mockResolvedValue({}),
      };

      (messageRepo.manager.transaction as jest.Mock).mockImplementation(
        (cb: (manager: { getRepository: (e: unknown) => unknown }) => Promise<ChatMessage>) =>
          cb({
            getRepository: (entity: unknown) => {
              if (entity === ChatMessage) return txMessageRepo;
              if (entity === ChatSession) return txSessionRepo;
              if (entity === ArtworkMatch) return txArtworkRepo;
              return txMessageRepo;
            },
          }),
      );

      return { txMessageRepo, txSessionRepo, txArtworkRepo };
    }

    it('persists a message and updates session timestamp', async () => {
      const { txMessageRepo, txSessionRepo } = setupPersistTransaction({});

      const result = await sut.persistMessage({
        sessionId: 'session-001',
        role: 'user',
        text: 'Hello',
      });

      expect(txMessageRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'user',
          text: 'Hello',
          session: { id: 'session-001' },
        }),
      );
      expect(txSessionRepo.save).toHaveBeenCalled();
      expect(result.id).toBe('new-msg');
    });

    it('persists artwork match when provided', async () => {
      const { txArtworkRepo } = setupPersistTransaction({});

      await sut.persistMessage({
        sessionId: 'session-001',
        role: 'assistant',
        text: 'This is the Mona Lisa',
        artworkMatch: {
          artworkId: 'art-001',
          title: 'Mona Lisa',
          artist: 'Leonardo da Vinci',
          confidence: 0.95,
          source: 'vision',
          room: 'Salle des Etats',
        },
      });

      expect(txArtworkRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          artworkId: 'art-001',
          title: 'Mona Lisa',
          artist: 'Leonardo da Vinci',
          confidence: 0.95,
        }),
      );
      expect(txArtworkRepo.save).toHaveBeenCalled();
    });

    it('applies session updates when provided', async () => {
      const session = makeSession();
      const { txSessionRepo } = setupPersistTransaction({ session });

      await sut.persistMessage({
        sessionId: 'session-001',
        role: 'assistant',
        text: 'Welcome',
        sessionUpdates: {
          title: 'New Title',
          museumName: 'Louvre',
          visitContext: {
            museumName: 'Louvre',
            museumConfidence: 0.9,
            artworksDiscussed: [],
            roomsVisited: [],
            detectedExpertise: 'beginner',
            expertiseSignals: 0,
            lastUpdated: '2025-06-01T00:00:00.000Z',
          },
          locale: 'fr',
        },
      });

      expect(session.title).toBe('New Title');
      expect(session.museumName).toBe('Louvre');
      expect(session.visitContext).toEqual(
        expect.objectContaining({ museumName: 'Louvre', museumConfidence: 0.9 }),
      );
      expect(session.locale).toBe('fr');
      expect(txSessionRepo.save).toHaveBeenCalledWith(session);
    });

    it('handles null session (not found)', async () => {
      setupPersistTransaction({ session: null });

      const result = await sut.persistMessage({
        sessionId: 'nonexistent',
        role: 'user',
        text: 'Hello',
      });

      // Should still return the saved message, session save is skipped
      expect(result.id).toBe('new-msg');
    });
  });

  // ─── listSessionMessages ───
  describe('listSessionMessages', () => {
    it('returns messages in chronological order with pagination', async () => {
      const msg1 = makeMessage({ id: 'm1', createdAt: new Date('2025-01-01T00:00:00Z') });
      const msg2 = makeMessage({ id: 'm2', createdAt: new Date('2025-01-01T01:00:00Z') });
      // Return 2 rows (no hasMore since limit=10)
      messageQb.getMany.mockResolvedValue([msg2, msg1]);

      const result = await sut.listSessionMessages({
        sessionId: 'session-001',
        limit: 10,
      });

      expect(messageQb.where).toHaveBeenCalledWith('session.id = :sessionId', {
        sessionId: 'session-001',
      });
      expect(messageQb.orderBy).toHaveBeenCalledWith('message.createdAt', 'DESC');
      expect(messageQb.take).toHaveBeenCalledWith(11); // limit + 1
      // Messages reversed to chronological order
      expect(result.messages[0].id).toBe('m1');
      expect(result.messages[1].id).toBe('m2');
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    it('detects hasMore and provides nextCursor', async () => {
      // 3 rows when limit=2 means hasMore
      const messages = [
        makeMessage({ id: 'm3', createdAt: new Date('2025-01-03') }),
        makeMessage({ id: 'm2', createdAt: new Date('2025-01-02') }),
        makeMessage({ id: 'm1', createdAt: new Date('2025-01-01') }),
      ];
      messageQb.getMany.mockResolvedValue(messages);

      const result = await sut.listSessionMessages({
        sessionId: 'session-001',
        limit: 2,
      });

      expect(result.hasMore).toBe(true);
      expect(result.messages).toHaveLength(2);
      expect(result.nextCursor).toBeTruthy();
    });

    it('applies cursor when provided', async () => {
      messageQb.getMany.mockResolvedValue([]);

      // Create a valid cursor
      const cursorPayload = { createdAt: '2025-01-02T00:00:00.000Z', id: 'cursor-id' };
      const cursor = Buffer.from(JSON.stringify(cursorPayload)).toString('base64url');

      await sut.listSessionMessages({
        sessionId: 'session-001',
        limit: 10,
        cursor,
      });

      expect(messageQb.andWhere).toHaveBeenCalledWith(
        '(message.createdAt < :cursorDate OR (message.createdAt = :cursorDate AND message.id < :cursorId))',
        {
          cursorDate: '2025-01-02T00:00:00.000Z',
          cursorId: 'cursor-id',
        },
      );
    });

    it('clamps limit to valid range', async () => {
      messageQb.getMany.mockResolvedValue([]);

      await sut.listSessionMessages({
        sessionId: 'session-001',
        limit: 100, // exceeds max of 50
      });

      expect(messageQb.take).toHaveBeenCalledWith(51); // clamped 50 + 1
    });

    it('handles invalid cursor gracefully', async () => {
      messageQb.getMany.mockResolvedValue([]);

      await sut.listSessionMessages({
        sessionId: 'session-001',
        limit: 10,
        cursor: 'invalid-cursor-data',
      });

      // Should not call andWhere since cursor decoding fails
      expect(messageQb.andWhere).not.toHaveBeenCalled();
    });
  });

  // ─── listSessionHistory ───
  describe('listSessionHistory', () => {
    it('returns messages in chronological order', async () => {
      const msg1 = makeMessage({ id: 'm1', createdAt: new Date('2025-01-01') });
      const msg2 = makeMessage({ id: 'm2', createdAt: new Date('2025-01-02') });
      messageQb.getMany.mockResolvedValue([msg2, msg1]);

      const result = await sut.listSessionHistory('session-001', 10);

      expect(messageQb.orderBy).toHaveBeenCalledWith('message.createdAt', 'DESC');
      // Reversed to chronological
      expect(result[0].id).toBe('m1');
      expect(result[1].id).toBe('m2');
    });

    it('clamps limit to 1..50', async () => {
      messageQb.getMany.mockResolvedValue([]);

      await sut.listSessionHistory('session-001', 200);

      expect(messageQb.take).toHaveBeenCalledWith(50);
    });
  });

  // ─── listSessions ───
  describe('listSessions', () => {
    it('returns sessions with previews and message counts', async () => {
      const session = makeSession({ id: 's1', updatedAt: new Date('2025-06-01') });
      sessionQb.getMany.mockResolvedValue([session]);

      // Message counts query
      messageQb.getRawMany
        .mockResolvedValueOnce([{ sessionId: 's1', messageCount: '5' }])
        // Message previews query
        .mockResolvedValueOnce([
          {
            sessionId: 's1',
            role: 'assistant',
            text: 'Hello there!',
            createdAt: new Date('2025-06-01'),
          },
        ]);

      const result = await sut.listSessions({
        userId: 1,
        limit: 10,
      });

      expect(sessionQb.where).toHaveBeenCalledWith('session."userId" = :userId', { userId: 1 });
      expect(result.sessions).toHaveLength(1);
      expect(result.sessions[0].messageCount).toBe(5);
      expect(result.sessions[0].preview?.text).toBe('Hello there!');
      expect(result.hasMore).toBe(false);
    });

    it('returns empty sessions array with no data', async () => {
      sessionQb.getMany.mockResolvedValue([]);

      const result = await sut.listSessions({
        userId: 1,
        limit: 10,
      });

      expect(result.sessions).toEqual([]);
      // Should not call message count/preview queries
      expect(messageQb.getRawMany).not.toHaveBeenCalled();
    });

    it('handles cursor-based pagination', async () => {
      sessionQb.getMany.mockResolvedValue([]);

      const cursorPayload = { updatedAt: '2025-06-01T00:00:00.000Z', id: 's-cursor' };
      const cursor = Buffer.from(JSON.stringify(cursorPayload)).toString('base64url');

      await sut.listSessions({
        userId: 1,
        limit: 10,
        cursor,
      });

      expect(sessionQb.andWhere).toHaveBeenCalledWith(
        '(session.updatedAt < :cursorUpdatedAt OR (session.updatedAt = :cursorUpdatedAt AND session.id < :cursorId))',
        {
          cursorUpdatedAt: '2025-06-01T00:00:00.000Z',
          cursorId: 's-cursor',
        },
      );
    });

    it('handles string createdAt in preview rows', async () => {
      const session = makeSession({ id: 's1', updatedAt: new Date('2025-06-01') });
      sessionQb.getMany.mockResolvedValue([session]);

      messageQb.getRawMany
        .mockResolvedValueOnce([{ sessionId: 's1', messageCount: '1' }])
        .mockResolvedValueOnce([
          {
            sessionId: 's1',
            role: 'user',
            text: 'Hi',
            createdAt: '2025-06-01T12:00:00.000Z', // string, not Date
          },
        ]);

      const result = await sut.listSessions({ userId: 1, limit: 10 });

      expect(result.sessions[0].preview?.createdAt).toBeInstanceOf(Date);
    });
  });

  // ─── hasMessageReport ───
  describe('hasMessageReport', () => {
    it('returns true when report exists', async () => {
      reportRepo.count.mockResolvedValue(1);

      const result = await sut.hasMessageReport('msg-001', 1);

      expect(result).toBe(true);
      expect(reportRepo.count).toHaveBeenCalledWith({
        where: { message: { id: 'msg-001' }, userId: 1 },
      });
    });

    it('returns false when no report exists', async () => {
      reportRepo.count.mockResolvedValue(0);

      const result = await sut.hasMessageReport('msg-001', 1);

      expect(result).toBe(false);
    });
  });

  // ─── persistMessageReport ───
  describe('persistMessageReport', () => {
    it('creates and saves a report', async () => {
      const entity = {} as MessageReport;
      reportRepo.create.mockReturnValue(entity);
      reportRepo.save.mockResolvedValue(entity);

      await sut.persistMessageReport({
        messageId: 'msg-001',
        userId: 1,
        reason: 'inappropriate',
        comment: 'Bad content',
      });

      expect(reportRepo.create).toHaveBeenCalledWith({
        message: { id: 'msg-001' },
        userId: 1,
        reason: 'inappropriate',
        comment: 'Bad content',
      });
      expect(reportRepo.save).toHaveBeenCalledWith(entity);
    });

    it('handles missing comment as null', async () => {
      reportRepo.create.mockReturnValue({} as MessageReport);
      reportRepo.save.mockResolvedValue({} as MessageReport);

      await sut.persistMessageReport({
        messageId: 'msg-001',
        userId: 1,
        reason: 'other',
      });

      expect(reportRepo.create).toHaveBeenCalledWith(expect.objectContaining({ comment: null }));
    });
  });

  // ─── upsertMessageFeedback ───
  describe('upsertMessageFeedback', () => {
    it('executes insert with onConflict update', async () => {
      feedbackQb.execute.mockResolvedValue({});

      await sut.upsertMessageFeedback('msg-001', 1, 'positive');

      expect(feedbackQb.insert).toHaveBeenCalled();
      expect(feedbackQb.into).toHaveBeenCalledWith(MessageFeedback);
      expect(feedbackQb.values).toHaveBeenCalledWith({
        messageId: 'msg-001',
        userId: 1,
        value: 'positive',
      });
      expect(feedbackQb.orUpdate).toHaveBeenCalledWith(['value'], ['messageId', 'userId']);
      expect(feedbackQb.execute).toHaveBeenCalled();
    });
  });

  // ─── deleteMessageFeedback ───
  describe('deleteMessageFeedback', () => {
    it('deletes feedback for message and user', async () => {
      feedbackRepo.delete.mockResolvedValue({ affected: 1, raw: [] });

      await sut.deleteMessageFeedback('msg-001', 1);

      expect(feedbackRepo.delete).toHaveBeenCalledWith({
        message: { id: 'msg-001' },
        userId: 1,
      });
    });
  });

  // ─── getMessageFeedback ───
  describe('getMessageFeedback', () => {
    it('returns feedback value when found', async () => {
      feedbackRepo.findOne.mockResolvedValue({ value: 'positive' } as MessageFeedback);

      const result = await sut.getMessageFeedback('msg-001', 1);

      expect(result).toEqual({ value: 'positive' });
      expect(feedbackRepo.findOne).toHaveBeenCalledWith({
        where: { message: { id: 'msg-001' }, userId: 1 },
        select: ['value'],
      });
    });

    it('returns null when no feedback exists', async () => {
      feedbackRepo.findOne.mockResolvedValue(null);

      const result = await sut.getMessageFeedback('msg-001', 1);

      expect(result).toBeNull();
    });
  });
});
