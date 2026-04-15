import { badRequest } from '@shared/errors/app.error';
import { env } from '@src/config/env';

import { isValidSessionListCursor } from './chat-image.helpers';
import { findNearbyMuseums } from './nearby-museums.provider';
import { ensureSessionAccess } from './session-access';

import type {
  CreateSessionResult,
  DeleteSessionResult,
  SessionResult,
  ListSessionsResult,
} from './chat.service.types';
import type {
  ChatRepository,
  ChatSessionsPage,
  SessionMessagesPage,
} from '../domain/chat.repository.interface';
import type { CreateSessionInput, MessagePageQuery, VisitContext } from '../domain/chat.types';
import type { ChatSession } from '../domain/chatSession.entity';
import type { IMuseumRepository } from '@modules/museum/domain/museum.repository.interface';
import type { CacheService } from '@shared/cache/cache.port';

const toSessionDTO = (session: ChatSession): CreateSessionResult => ({
  id: session.id,
  locale: session.locale,
  museumMode: session.museumMode,
  title: session.title ?? null,
  museumName: session.museumName ?? null,
  createdAt: session.createdAt.toISOString(),
  updatedAt: session.updatedAt.toISOString(),
});

/** Dependencies for the session sub-service. */
interface ChatSessionServiceDeps {
  repository: ChatRepository;
  cache?: CacheService;
  museumRepository?: IMuseumRepository;
}

/**
 * Handles session CRUD: create, get (with paginated messages), list, and delete-if-empty.
 */
export class ChatSessionService {
  private readonly repository: ChatRepository;
  private readonly cache?: CacheService;
  private readonly museumRepository?: IMuseumRepository;

  constructor(deps: ChatSessionServiceDeps) {
    this.repository = deps.repository;
    this.cache = deps.cache;
    this.museumRepository = deps.museumRepository;
  }

  /**
   * Creates a new chat session. When a museumId is provided and a museum repository
   * is available, resolves museum name/address/description from the database and seeds
   * the visit context. When coordinates are provided, finds nearby museums via haversine.
   *
   * Note: when museumId is provided, a DB lookup is always performed to fetch the
   * museum description (seeded into visitContext.museumDescription for the first-message
   * intro), even if the caller already supplies museumName. Caller-provided museumName
   * still takes precedence over the DB name via the `??=` operator.
   *
   * @param input - Session creation parameters (userId, locale, museumMode, museumId, coordinates).
   * @returns The newly created session.
   * @throws {AppError} 400 if userId is not a positive integer.
   */
  async createSession(input: CreateSessionInput): Promise<CreateSessionResult> {
    if (input.userId !== undefined && (!Number.isInteger(input.userId) || input.userId <= 0)) {
      throw badRequest('userId must be a positive integer');
    }

    const { museumName, visitContext } = await this.resolveMuseumInfo(input);

    const session = await this.repository.createSession({
      userId: input.userId,
      locale: input.locale,
      museumMode: input.museumMode,
      museumId: input.museumId,
      museumName,
      coordinates: input.coordinates,
      visitContext,
    });

    if (this.cache && input.userId) {
      await this.cache.delByPrefix(`sessions:user:${String(input.userId)}:`);
    }

    return toSessionDTO(session);
  }

  private async resolveMuseumInfo(input: CreateSessionInput): Promise<{
    museumName: string | undefined;
    visitContext: VisitContext | undefined;
  }> {
    let museumName = input.museumName;
    let museumAddress = input.museumAddress;
    let museumDescription: string | undefined;

    // Fetch the museum entity when museumId is provided, even if the caller
    // already passed museumName. We need the description for the first-message
    // intro — it lives only on the Museum DB entity.
    if (input.museumId && this.museumRepository) {
      const museum = await this.museumRepository.findById(input.museumId);
      if (museum) {
        museumName ??= museum.name;
        museumAddress ??= museum.address ?? undefined;
        museumDescription = museum.description ?? undefined;
      }
    }

    let visitContext: VisitContext | undefined;
    if (museumName) {
      visitContext = {
        museumName,
        museumAddress,
        museumDescription,
        museumConfidence: 1,
        artworksDiscussed: [],
        roomsVisited: [],
        detectedExpertise: 'beginner',
        expertiseSignals: 0,
        lastUpdated: new Date().toISOString(),
      };
    }

    if (input.coordinates && this.museumRepository) {
      const nearby = await findNearbyMuseums(
        input.coordinates.lat,
        input.coordinates.lng,
        this.museumRepository,
      );
      if (nearby.length > 0) {
        visitContext ??= {
          museumConfidence: 0,
          artworksDiscussed: [],
          roomsVisited: [],
          detectedExpertise: 'beginner',
          expertiseSignals: 0,
          lastUpdated: new Date().toISOString(),
        };
        visitContext.nearbyMuseums = nearby;
      }
    }

    return { museumName, visitContext };
  }

  /**
   * Retrieves a session with its paginated messages.
   *
   * @param sessionId - UUID of the session to retrieve.
   * @param page - Cursor-based pagination parameters (limit, cursor).
   * @param currentUserId - Authenticated user id for ownership checks.
   * @returns The session details and a page of messages.
   * @throws {AppError} 400 on invalid id, 404 if session not found or not owned.
   */
  async getSession(
    sessionId: string,
    page: MessagePageQuery,
    currentUserId?: number,
  ): Promise<SessionResult> {
    const session = await ensureSessionAccess(sessionId, this.repository, currentUserId);

    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- zero fallback
    const limit = Math.max(1, Math.min(page.limit || 20, 50));
    const cacheKey = `session:${sessionId}:${page.cursor ?? 'first'}:${String(limit)}`;

    if (this.cache) {
      const cached = await this.cache.get<SessionResult>(cacheKey);
      if (cached) return cached;
    }

    const rows: SessionMessagesPage = await this.repository.listSessionMessages({
      sessionId,
      limit,
      cursor: page.cursor,
    });

    const result: SessionResult = {
      session: toSessionDTO(session),
      messages: rows.messages.map((message) => ({
        id: message.id,
        role: message.role,
        text: message.text,
        imageRef: message.imageRef,
        image: null,
        createdAt: message.createdAt.toISOString(),
        metadata: message.metadata,
      })),
      page: {
        nextCursor: rows.nextCursor,
        hasMore: rows.hasMore,
        limit,
      },
    };

    if (this.cache) {
      await this.cache.set(cacheKey, result, env.cache?.sessionTtlSeconds ?? 3600);
    }

    return result;
  }

  /**
   * Lists all sessions for the authenticated user with cursor-based pagination.
   *
   * @param page - Cursor-based pagination parameters (limit, cursor).
   * @param currentUserId - Authenticated user id (required).
   * @returns Paginated sessions with message previews.
   * @throws {AppError} 400 if userId is missing/invalid or cursor is malformed.
   */
  async listSessions(page: MessagePageQuery, currentUserId?: number): Promise<ListSessionsResult> {
    if (currentUserId === undefined || !Number.isInteger(currentUserId) || currentUserId <= 0) {
      throw badRequest('Authenticated user id is required');
    }
    const userId = currentUserId;

    if (page.cursor && !isValidSessionListCursor(page.cursor)) {
      throw badRequest('Invalid cursor format');
    }

    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- zero fallback
    const limit = Math.max(1, Math.min(page.limit || 20, 50));
    const cacheKey = `sessions:user:${String(userId)}:${page.cursor ?? 'first'}:${String(limit)}`;

    if (this.cache) {
      const cached = await this.cache.get<ListSessionsResult>(cacheKey);
      if (cached) return cached;
    }

    const rows: ChatSessionsPage = await this.repository.listSessions({
      userId,
      limit,
      cursor: page.cursor,
    });

    const result: ListSessionsResult = {
      sessions: rows.sessions.map((row) => ({
        id: row.session.id,
        locale: row.session.locale,
        museumMode: row.session.museumMode,
        title: row.session.title ?? null,
        museumName: row.session.museumName ?? null,
        createdAt: row.session.createdAt.toISOString(),
        updatedAt: row.session.updatedAt.toISOString(),
        preview: row.preview
          ? {
              // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string fallback
              text: row.preview.text || '[Image message]',
              createdAt: row.preview.createdAt.toISOString(),
              role: row.preview.role,
            }
          : undefined,
        messageCount: row.messageCount,
      })),
      page: {
        nextCursor: rows.nextCursor,
        hasMore: rows.hasMore,
        limit,
      },
    };

    if (this.cache) {
      await this.cache.set(cacheKey, result, env.cache?.listTtlSeconds ?? 300);
    }

    return result;
  }

  /**
   * Deletes a session only if it contains no messages.
   *
   * @param sessionId - UUID of the session to delete.
   * @param currentUserId - Authenticated user id for ownership checks.
   * @returns Whether the session was actually deleted.
   * @throws {AppError} 400 on invalid id, 404 if session not found or not owned.
   */
  async deleteSessionIfEmpty(
    sessionId: string,
    currentUserId?: number,
  ): Promise<DeleteSessionResult> {
    const session = await ensureSessionAccess(sessionId, this.repository, currentUserId);

    const deleted = await this.repository.deleteSessionIfEmpty(sessionId);

    if (deleted && this.cache) {
      await this.cache.delByPrefix(`session:${sessionId}:`);
      if (session.user?.id) {
        await this.cache.delByPrefix(`sessions:user:${String(session.user.id)}:`);
      }
    }

    return {
      sessionId,
      deleted,
    };
  }
}
