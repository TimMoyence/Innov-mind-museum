import { ChatSessionService } from '@modules/chat/application/chat-session.service';
import type {
  ChatRepository,
  ChatSessionsPage,
  SessionMessagesPage,
} from '@modules/chat/domain/chat.repository.interface';
import type { ChatSession } from '@modules/chat/domain/chatSession.entity';
import type { CacheService } from '@shared/cache/cache.port';
import { AppError } from '@shared/errors/app.error';

// ── Factories ──────────────────────────────────────────────────────────

const makeSession = (overrides: Partial<ChatSession> = {}): ChatSession =>
  ({
    id: 'a0a0a0a0-b1b1-4c2c-8d3d-e4e4e4e4e4e4',
    locale: 'en',
    museumMode: false,
    title: null,
    museumName: null,
    messages: [],
    version: 1,
    user: { id: 42 },
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  }) as ChatSession;

const makeRepo = (session: ChatSession | null = makeSession()): jest.Mocked<ChatRepository> => ({
  createSession: jest.fn().mockResolvedValue(session),
  getSessionById: jest.fn().mockResolvedValue(session),
  getMessageById: jest.fn().mockResolvedValue(null),
  deleteSessionIfEmpty: jest.fn().mockResolvedValue(true),
  persistMessage: jest.fn(),
  listSessionMessages: jest.fn().mockResolvedValue({
    messages: [],
    nextCursor: null,
    hasMore: false,
  } satisfies SessionMessagesPage),
  listSessionHistory: jest.fn().mockResolvedValue([]),
  listSessions: jest.fn().mockResolvedValue({
    sessions: [],
    nextCursor: null,
    hasMore: false,
  } satisfies ChatSessionsPage),
  hasMessageReport: jest.fn().mockResolvedValue(false),
  persistMessageReport: jest.fn(),
  exportUserData: jest.fn(),
});

const makeCache = (): jest.Mocked<CacheService> => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
  delByPrefix: jest.fn().mockResolvedValue(undefined),
  setNx: jest.fn().mockResolvedValue(true),
});

// ── Tests ──────────────────────────────────────────────────────────────

describe('ChatSessionService', () => {
  beforeEach(() => jest.clearAllMocks());

  // ── createSession ──────────────────────────────────────────────────

  describe('createSession', () => {
    it('creates a session for an authenticated user', async () => {
      const repo = makeRepo();
      const svc = new ChatSessionService({ repository: repo });

      const result = await svc.createSession({ userId: 42, locale: 'fr', museumMode: true });

      expect(result.id).toBeDefined();
      expect(repo.createSession).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 42, locale: 'fr', museumMode: true }),
      );
    });

    it('creates a session for anonymous visitor (no userId)', async () => {
      const session = makeSession({ user: null });
      const repo = makeRepo(session);
      const svc = new ChatSessionService({ repository: repo });

      const result = await svc.createSession({ locale: 'en' });

      expect(result.id).toBe(session.id);
      expect(repo.createSession).toHaveBeenCalledWith(expect.objectContaining({ locale: 'en' }));
    });

    it('invalidates session list cache on creation', async () => {
      const repo = makeRepo();
      const cache = makeCache();
      const svc = new ChatSessionService({ repository: repo, cache });

      await svc.createSession({ userId: 42 });

      expect(cache.delByPrefix).toHaveBeenCalledWith('sessions:user:42:');
    });

    it('rejects non-positive userId', async () => {
      const repo = makeRepo();
      const svc = new ChatSessionService({ repository: repo });

      await expect(svc.createSession({ userId: -1 })).rejects.toThrow(AppError);
      await expect(svc.createSession({ userId: 0 })).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  // ── getSession ─────────────────────────────────────────────────────

  describe('getSession', () => {
    it('returns session with paginated messages', async () => {
      const repo = makeRepo();
      const svc = new ChatSessionService({ repository: repo });

      const result = await svc.getSession(
        'a0a0a0a0-b1b1-4c2c-8d3d-e4e4e4e4e4e4',
        { limit: 20 },
        42,
      );

      expect(result.session.id).toBe('a0a0a0a0-b1b1-4c2c-8d3d-e4e4e4e4e4e4');
      expect(result.messages).toEqual([]);
      expect(result.page.hasMore).toBe(false);
    });

    it('throws 404 when session not found', async () => {
      const repo = makeRepo(null);
      const svc = new ChatSessionService({ repository: repo });

      await expect(
        svc.getSession('a0a0a0a0-b1b1-4c2c-8d3d-e4e4e4e4e4e4', { limit: 20 }),
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('throws 404 when user does not own the session', async () => {
      const session = makeSession({ user: { id: 99 } as ChatSession['user'] });
      const repo = makeRepo(session);
      const svc = new ChatSessionService({ repository: repo });

      await expect(
        svc.getSession('a0a0a0a0-b1b1-4c2c-8d3d-e4e4e4e4e4e4', { limit: 20 }, 42),
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('throws 400 on invalid session id format', async () => {
      const repo = makeRepo();
      const svc = new ChatSessionService({ repository: repo });

      await expect(svc.getSession('not-a-uuid', { limit: 20 })).rejects.toMatchObject({
        statusCode: 400,
      });
    });
  });

  // ── listSessions ───────────────────────────────────────────────────

  describe('listSessions', () => {
    it('returns paginated sessions for the user', async () => {
      const repo = makeRepo();
      const svc = new ChatSessionService({ repository: repo });

      const result = await svc.listSessions({ limit: 10 }, 42);

      expect(result.sessions).toEqual([]);
      expect(result.page.hasMore).toBe(false);
      expect(repo.listSessions).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 42, limit: 10 }),
      );
    });

    it('returns empty list when user has no sessions', async () => {
      const repo = makeRepo();
      const svc = new ChatSessionService({ repository: repo });

      const result = await svc.listSessions({ limit: 20 }, 42);

      expect(result.sessions).toHaveLength(0);
    });

    it('rejects when no authenticated user id', async () => {
      const repo = makeRepo();
      const svc = new ChatSessionService({ repository: repo });

      await expect(svc.listSessions({ limit: 20 })).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  // ── deleteSessionIfEmpty ───────────────────────────────────────────

  describe('deleteSessionIfEmpty', () => {
    it('deletes an empty session and invalidates cache', async () => {
      const repo = makeRepo();
      const cache = makeCache();
      const svc = new ChatSessionService({ repository: repo, cache });

      const result = await svc.deleteSessionIfEmpty('a0a0a0a0-b1b1-4c2c-8d3d-e4e4e4e4e4e4', 42);

      expect(result.deleted).toBe(true);
      expect(cache.delByPrefix).toHaveBeenCalledWith(
        'session:a0a0a0a0-b1b1-4c2c-8d3d-e4e4e4e4e4e4:',
      );
      expect(cache.delByPrefix).toHaveBeenCalledWith('sessions:user:42:');
    });

    it('returns deleted=false when session has messages', async () => {
      const repo = makeRepo();
      repo.deleteSessionIfEmpty.mockResolvedValue(false);
      const svc = new ChatSessionService({ repository: repo });

      const result = await svc.deleteSessionIfEmpty('a0a0a0a0-b1b1-4c2c-8d3d-e4e4e4e4e4e4', 42);

      expect(result.deleted).toBe(false);
    });

    it('throws 404 when session not found', async () => {
      const repo = makeRepo(null);
      const svc = new ChatSessionService({ repository: repo });

      await expect(
        svc.deleteSessionIfEmpty('a0a0a0a0-b1b1-4c2c-8d3d-e4e4e4e4e4e4', 42),
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('throws 404 when deleting session owned by another user', async () => {
      const session = makeSession({ user: { id: 99 } as ChatSession['user'] });
      const repo = makeRepo(session);
      const svc = new ChatSessionService({ repository: repo });

      await expect(
        svc.deleteSessionIfEmpty('a0a0a0a0-b1b1-4c2c-8d3d-e4e4e4e4e4e4', 42),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });
});
