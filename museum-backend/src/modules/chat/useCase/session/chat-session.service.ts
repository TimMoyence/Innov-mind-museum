import { findNearbyMuseums } from '@modules/chat/useCase/enrichment/nearby-museums.provider';
import { isValidSessionListCursor } from '@modules/chat/useCase/image/chat-image.helpers';
import { invalidInput } from '@shared/errors/app.error';
import { nonEmpty } from '@shared/utils/defaults';
import { env } from '@src/config/env';

import { ensureSessionAccess } from './session-access';
import { toPageLimit, toSessionDTO, toSessionMessageView, withHttpsImages } from './session.view';

import type {
  CreateSessionInput,
  MessagePageQuery,
  VisitContext,
} from '@modules/chat/domain/chat.types';
import type {
  ChatRepository,
  ChatSessionsPage,
  SessionMessagesPage,
} from '@modules/chat/domain/session/chat.repository.interface';
import type { ChatSession } from '@modules/chat/domain/session/chatSession.entity';
import type {
  CreateSessionResult,
  DeleteSessionResult,
  SessionResult,
  ListSessionsResult,
} from '@modules/chat/useCase/orchestration/chat.service.types';
import type { IMuseumRepository } from '@modules/museum/domain/museum/museum.repository.interface';
import type { CacheService } from '@shared/cache/cache.port';

export const deriveLastArtworkTitle = (
  visitContext: VisitContext | null | undefined,
): string | null => {
  const artworks = visitContext?.artworksDiscussed;
  if (!Array.isArray(artworks) || artworks.length === 0) {
    return null;
  }
  const last = artworks[artworks.length - 1];
  const title = typeof last.title === 'string' ? last.title.trim() : '';
  return title.length > 0 ? title : null;
};

interface ChatSessionServiceDeps {
  repository: ChatRepository;
  cache?: CacheService;
  museumRepository?: IMuseumRepository;
}

export class ChatSessionService {
  private readonly repository: ChatRepository;
  private readonly cache?: CacheService;
  private readonly museumRepository?: IMuseumRepository;

  constructor(deps: ChatSessionServiceDeps) {
    this.repository = deps.repository;
    this.cache = deps.cache;
    this.museumRepository = deps.museumRepository;
  }

  async createSession(input: CreateSessionInput): Promise<CreateSessionResult> {
    if (input.userId !== undefined && (!Number.isInteger(input.userId) || input.userId <= 0)) {
      throw invalidInput('userId must be a positive integer');
    }

    const { museumName, visitContext } = await this.resolveMuseumInfo(input);

    const session = await this.repository.createSession({
      userId: input.userId,
      locale: input.locale,
      museumMode: input.museumMode,
      intent: input.intent ?? 'default',
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

  async getSession(
    sessionId: string,
    page: MessagePageQuery,
    currentUserId?: number,
  ): Promise<SessionResult> {
    const session = await ensureSessionAccess(sessionId, this.repository, currentUserId);

    const limit = toPageLimit(page.limit);
    const cacheKey = `session:${sessionId}:${page.cursor ?? 'first'}:${String(limit)}`;

    const cached = this.cache ? await this.cache.get<SessionResult>(cacheKey) : null;
    return withHttpsImages(
      cached ?? (await this.loadSessionPage(session, page.cursor, limit, cacheKey)),
    );
  }

  private async loadSessionPage(
    session: ChatSession,
    cursor: string | undefined,
    limit: number,
    cacheKey: string,
  ): Promise<SessionResult> {
    const rows: SessionMessagesPage = await this.repository.listSessionMessages({
      sessionId: session.id,
      limit,
      cursor,
    });

    const result: SessionResult = {
      session: toSessionDTO(session),
      messages: rows.messages.map(toSessionMessageView),
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

  async listSessions(page: MessagePageQuery, currentUserId?: number): Promise<ListSessionsResult> {
    if (currentUserId === undefined || !Number.isInteger(currentUserId) || currentUserId <= 0) {
      throw invalidInput('Authenticated user id is required');
    }
    const userId = currentUserId;

    if (page.cursor && !isValidSessionListCursor(page.cursor)) {
      throw invalidInput('Invalid cursor format');
    }

    const limit = toPageLimit(page.limit);
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
        museumId: row.session.museumId ?? null,
        lastArtworkTitle: deriveLastArtworkTitle(row.session.visitContext),
        createdAt: row.session.createdAt.toISOString(),
        updatedAt: row.session.updatedAt.toISOString(),
        intent: row.session.intent,
        preview: row.preview
          ? {
              text: nonEmpty(row.preview.text) ?? '[Image message]',
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
