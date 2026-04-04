import { ChatSessionService } from '@modules/chat/useCase/chat-session.service';
import type {
  ChatSessionsPage,
  SessionMessagesPage,
} from '@modules/chat/domain/chat.repository.interface';
import type { ChatSession } from '@modules/chat/domain/chatSession.entity';
import { AppError } from '@shared/errors/app.error';
import { makeSession } from '../../helpers/chat/message.fixtures';
import { makeChatRepo } from '../../helpers/chat/repo.fixtures';
import { makeCache } from '../../helpers/chat/cache.fixtures';
import { makeMuseum, makeMuseumRepo } from '../../helpers/museum/museum.fixtures';

// ── Factories ──────────────────────────────────────────────────────────

const SESSION_ID = 'a0a0a0a0-b1b1-4c2c-8d3d-e4e4e4e4e4e4';

const makeRepo = (
  session: ChatSession | null = makeSession({
    id: SESSION_ID,
    user: { id: 42 } as ChatSession['user'],
  }),
) =>
  makeChatRepo({
    createSession: jest.fn().mockResolvedValue(session),
    getSessionById: jest.fn().mockResolvedValue(session),
    getMessageById: jest.fn().mockResolvedValue(null),
    deleteSessionIfEmpty: jest.fn().mockResolvedValue(true),
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

      expect(result.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
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

    it('resolves museum name from museumId when museumRepository is provided', async () => {
      const museum = makeMuseum({ id: 42, name: 'Louvre', address: '75001 Paris' });
      const museumRepo = makeMuseumRepo({
        findById: jest.fn().mockResolvedValue(museum),
      });
      const repo = makeRepo();
      const svc = new ChatSessionService({ repository: repo, museumRepository: museumRepo });

      await svc.createSession({ userId: 42, museumId: 42, museumMode: true });

      expect(museumRepo.findById).toHaveBeenCalledWith(42);
      expect(repo.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          museumName: 'Louvre',
          visitContext: expect.objectContaining({
            museumName: 'Louvre',
            museumAddress: '75001 Paris',
            museumConfidence: 1.0,
          }),
        }),
      );
    });

    it('finds nearby museums when coordinates are provided', async () => {
      const museumRepo = makeMuseumRepo({
        findAll: jest
          .fn()
          .mockResolvedValue([
            makeMuseum({ id: 1, name: 'Louvre', latitude: 48.8606, longitude: 2.3376 }),
            makeMuseum({ id: 2, name: 'Orsay', latitude: 48.86, longitude: 2.3266 }),
          ]),
      });
      const repo = makeRepo();
      const svc = new ChatSessionService({ repository: repo, museumRepository: museumRepo });

      await svc.createSession({ userId: 42, coordinates: { lat: 48.8606, lng: 2.3376 } });

      expect(repo.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          visitContext: expect.objectContaining({
            nearbyMuseums: expect.arrayContaining([expect.objectContaining({ name: 'Louvre' })]),
          }),
        }),
      );
    });

    it('creates session without museum resolution when no museumRepository', async () => {
      const repo = makeRepo();
      const svc = new ChatSessionService({ repository: repo });

      await svc.createSession({ userId: 42, museumId: 99, museumMode: true });

      expect(repo.createSession).toHaveBeenCalledWith(expect.objectContaining({ museumId: 99 }));
      // visitContext should be undefined since no museum name and no coordinates repo
      expect(repo.createSession).toHaveBeenCalledWith(
        expect.objectContaining({ visitContext: undefined }),
      );
    });

    it('skips museum lookup when museumName is already provided', async () => {
      const museumRepo = makeMuseumRepo();
      const repo = makeRepo();
      const svc = new ChatSessionService({ repository: repo, museumRepository: museumRepo });

      await svc.createSession({
        userId: 42,
        museumId: 1,
        museumName: 'Custom Name',
        museumMode: true,
      });

      expect(museumRepo.findById).not.toHaveBeenCalled();
      expect(repo.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          museumName: 'Custom Name',
          visitContext: expect.objectContaining({ museumName: 'Custom Name' }),
        }),
      );
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
