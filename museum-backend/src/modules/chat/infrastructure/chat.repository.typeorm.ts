import { DataSource, Repository } from 'typeorm';

import { ArtworkMatch } from '../domain/artworkMatch.entity';
import {
  ChatRepository,
  ChatSessionsPage,
  PersistArtworkMatchInput,
  PersistMessageInput,
  ListSessionsParams,
  ListSessionMessagesParams,
  SessionMessagesPage,
} from '../domain/chat.repository.interface';
import { ChatMessage } from '../domain/chatMessage.entity';
import { ChatSession } from '../domain/chatSession.entity';
import { ChatRole, CreateSessionInput } from '../domain/chat.types';

const encodeCursor = (value: { createdAt: string; id: string }): string => {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
};

const decodeCursor = (value: string): { createdAt: string; id: string } | null => {
  try {
    const decoded = Buffer.from(value, 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded) as unknown;

    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as Record<string, unknown>).createdAt === 'string' &&
      typeof (parsed as Record<string, unknown>).id === 'string'
    ) {
      return {
        createdAt: (parsed as Record<string, string>).createdAt,
        id: (parsed as Record<string, string>).id,
      };
    }

    return null;
  } catch {
    return null;
  }
};

const encodeSessionCursor = (value: { updatedAt: string; id: string }): string => {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
};

const decodeSessionCursor = (
  value: string,
): { updatedAt: string; id: string } | null => {
  try {
    const decoded = Buffer.from(value, 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded) as unknown;

    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as Record<string, unknown>).updatedAt === 'string' &&
      typeof (parsed as Record<string, unknown>).id === 'string'
    ) {
      return {
        updatedAt: (parsed as Record<string, string>).updatedAt,
        id: (parsed as Record<string, string>).id,
      };
    }

    return null;
  } catch {
    return null;
  }
};

export class TypeOrmChatRepository implements ChatRepository {
  private readonly sessionRepo: Repository<ChatSession>;
  private readonly messageRepo: Repository<ChatMessage>;
  private readonly artworkMatchRepo: Repository<ArtworkMatch>;

  constructor(dataSource: DataSource) {
    this.sessionRepo = dataSource.getRepository(ChatSession);
    this.messageRepo = dataSource.getRepository(ChatMessage);
    this.artworkMatchRepo = dataSource.getRepository(ArtworkMatch);
  }

  async createSession(input: CreateSessionInput): Promise<ChatSession> {
    const session = this.sessionRepo.create({
      locale: input.locale || null,
      museumMode: input.museumMode ?? false,
      user: input.userId ? ({ id: input.userId } as ChatSession['user']) : null,
    });

    return this.sessionRepo.save(session);
  }

  async getSessionById(sessionId: string): Promise<ChatSession | null> {
    return this.sessionRepo.findOne({
      where: { id: sessionId },
      relations: {
        user: true,
      },
    });
  }

  async persistMessage(input: PersistMessageInput): Promise<ChatMessage> {
    const entity = this.messageRepo.create({
      role: input.role,
      text: input.text || null,
      imageRef: input.imageRef || null,
      metadata: input.metadata || null,
      session: { id: input.sessionId } as ChatSession,
    });

    return this.messageRepo.save(entity);
  }

  async persistArtworkMatch(input: PersistArtworkMatchInput): Promise<void> {
    const entity = this.artworkMatchRepo.create({
      artworkId: input.artworkId || null,
      artist: input.artist || null,
      title: input.title || null,
      source: input.source || null,
      confidence: input.confidence ?? 0,
      message: { id: input.messageId } as ChatMessage,
    });

    await this.artworkMatchRepo.save(entity);
  }

  async listSessionMessages({
    sessionId,
    limit,
    cursor,
  }: ListSessionMessagesParams): Promise<SessionMessagesPage> {
    const effectiveLimit = Math.max(1, Math.min(limit, 50));
    const queryBuilder = this.messageRepo
      .createQueryBuilder('message')
      .leftJoin('message.session', 'session')
      .where('session.id = :sessionId', { sessionId })
      .orderBy('message.createdAt', 'DESC')
      .addOrderBy('message.id', 'DESC')
      .take(effectiveLimit + 1);

    if (cursor) {
      const decodedCursor = decodeCursor(cursor);
      if (decodedCursor) {
        queryBuilder.andWhere(
          '(message.createdAt < :cursorDate OR (message.createdAt = :cursorDate AND message.id < :cursorId))',
          {
            cursorDate: decodedCursor.createdAt,
            cursorId: decodedCursor.id,
          },
        );
      }
    }

    const rows = await queryBuilder.getMany();
    const hasMore = rows.length > effectiveLimit;
    const messages = hasMore ? rows.slice(0, effectiveLimit) : rows;
    const last = messages[messages.length - 1];
    const nextCursor =
      hasMore && last
        ? encodeCursor({
            createdAt: last.createdAt.toISOString(),
            id: last.id,
          })
        : null;

    return {
      messages: messages.reverse(),
      hasMore,
      nextCursor,
    };
  }

  async listSessionHistory(sessionId: string, limit: number): Promise<ChatMessage[]> {
    const rows = await this.messageRepo
      .createQueryBuilder('message')
      .leftJoin('message.session', 'session')
      .where('session.id = :sessionId', { sessionId })
      .orderBy('message.createdAt', 'DESC')
      .addOrderBy('message.id', 'DESC')
      .take(Math.max(1, Math.min(limit, 50)))
      .getMany();

    return rows.reverse();
  }

  async listSessions({
    userId,
    limit,
    cursor,
  }: ListSessionsParams): Promise<ChatSessionsPage> {
    const effectiveLimit = Math.max(1, Math.min(limit, 50));
    const queryBuilder = this.sessionRepo
      .createQueryBuilder('session')
      .leftJoin('session.user', 'user')
      .where('user.id = :userId', { userId })
      .orderBy('session.updatedAt', 'DESC')
      .addOrderBy('session.id', 'DESC')
      .take(effectiveLimit + 1);

    if (cursor) {
      const decodedCursor = decodeSessionCursor(cursor);
      if (decodedCursor) {
        queryBuilder.andWhere(
          '(session.updatedAt < :cursorUpdatedAt OR (session.updatedAt = :cursorUpdatedAt AND session.id < :cursorId))',
          {
            cursorUpdatedAt: decodedCursor.updatedAt,
            cursorId: decodedCursor.id,
          },
        );
      }
    }

    const rows = await queryBuilder.getMany();
    const hasMore = rows.length > effectiveLimit;
    const sessions = hasMore ? rows.slice(0, effectiveLimit) : rows;
    const last = sessions[sessions.length - 1];
    const nextCursor =
      hasMore && last
        ? encodeSessionCursor({
            updatedAt: last.updatedAt.toISOString(),
            id: last.id,
          })
        : null;

    const sessionIds = sessions.map((session) => session.id);
    if (!sessionIds.length) {
      return {
        sessions: [],
        hasMore,
        nextCursor,
      };
    }

    const messageCounts = await this.messageRepo
      .createQueryBuilder('message')
      .select('message.sessionId', 'sessionId')
      .addSelect('COUNT(message.id)', 'messageCount')
      .where('message.sessionId IN (:...sessionIds)', { sessionIds })
      .groupBy('message.sessionId')
      .getRawMany<{ sessionId: string; messageCount: string }>();

    const countBySessionId = new Map<string, number>();
    messageCounts.forEach((row) => {
      countBySessionId.set(row.sessionId, Number(row.messageCount) || 0);
    });

    const previewRows = await this.messageRepo
      .createQueryBuilder('message')
      .select('message.sessionId', 'sessionId')
      .addSelect('message.role', 'role')
      .addSelect('message.text', 'text')
      .addSelect('message.createdAt', 'createdAt')
      .where('message.sessionId IN (:...sessionIds)', { sessionIds })
      .distinctOn(['message.sessionId'])
      .orderBy('message.sessionId', 'ASC')
      .addOrderBy('message.createdAt', 'DESC')
      .addOrderBy('message.id', 'DESC')
      .getRawMany<{
        sessionId: string;
        role: ChatRole;
        text: string | null;
        createdAt: Date | string;
      }>();

    const previewBySessionId = new Map<
      string,
      { role: ChatRole; text: string | null; createdAt: Date }
    >();
    previewRows.forEach((row) => {
      previewBySessionId.set(row.sessionId, {
        role: row.role,
        text: row.text,
        createdAt:
          row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt),
      });
    });

    return {
      sessions: sessions.map((session) => ({
        session,
        preview: previewBySessionId.get(session.id),
        messageCount: countBySessionId.get(session.id) || 0,
      })),
      hasMore,
      nextCursor,
    };
  }
}
