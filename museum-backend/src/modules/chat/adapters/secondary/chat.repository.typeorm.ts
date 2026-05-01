import { z } from 'zod';

import { CursorCodec } from '@shared/pagination/cursor-codec';

import {
  fetchMessageCounts,
  fetchMessagePreviews,
  exportUserChatData,
} from './chat-repository-queries';
import { ArtworkMatch } from '../../domain/artworkMatch.entity';
import { ChatMessage } from '../../domain/chatMessage.entity';
import { ChatSession } from '../../domain/chatSession.entity';
import { MessageFeedback } from '../../domain/messageFeedback.entity';
import { MessageReport } from '../../domain/messageReport.entity';

import type {
  ChatRepository,
  ChatSessionsPage,
  ChatMessageWithSessionOwnership,
  PersistMessageInput,
  PersistMessageReportInput,
  ListSessionsParams,
  ListSessionMessagesParams,
  SessionMessagesPage,
  UserChatExportData,
} from '../../domain/chat.repository.interface';
import type { CreateSessionInput } from '../../domain/chat.types';
import type { FeedbackValue } from '../../domain/messageFeedback.entity';
import type { DataSource, EntityManager, Repository } from 'typeorm';

const messageCursor = new CursorCodec(z.object({ createdAt: z.string(), id: z.string() }));
const sessionCursor = new CursorCodec(z.object({ updatedAt: z.string(), id: z.string() }));

/** Maximum number of items per page for cursor-based pagination queries. */
const MAX_PAGE_SIZE = 50;

/** Applies optional session update fields to a session entity. */
const applySessionUpdates = (
  session: ChatSession,
  updates: PersistMessageInput['sessionUpdates'],
): void => {
  if (!updates) return;
  if (updates.title !== undefined) session.title = updates.title;
  if (updates.museumName !== undefined) session.museumName = updates.museumName;
  if (updates.visitContext !== undefined) session.visitContext = updates.visitContext;
  if (updates.locale !== undefined) session.locale = updates.locale;
};

/** TypeORM/PG implementation of {@link ChatRepository}. */
export class TypeOrmChatRepository implements ChatRepository {
  private readonly sessionRepo: Repository<ChatSession>;
  private readonly messageRepo: Repository<ChatMessage>;
  private readonly reportRepo: Repository<MessageReport>;
  private readonly feedbackRepo: Repository<MessageFeedback>;

  /** Creates a new TypeORM chat repository. \@param dataSource - Active TypeORM DataSource used to obtain entity repositories. */
  constructor(dataSource: DataSource) {
    this.sessionRepo = dataSource.getRepository(ChatSession);
    this.messageRepo = dataSource.getRepository(ChatMessage);
    this.reportRepo = dataSource.getRepository(MessageReport);
    this.feedbackRepo = dataSource.getRepository(MessageFeedback);
  }

  /**
   * Creates a new chat session.
   *
   * @param input - Session creation parameters (locale, museumMode, userId).
   * @returns The persisted ChatSession entity.
   */
  async createSession(input: CreateSessionInput): Promise<ChatSession> {
    const session = this.sessionRepo.create({
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string fallback
      locale: input.locale || null,
      museumMode: input.museumMode ?? false,
      intent: input.intent ?? 'default',
      user: input.userId ? ({ id: input.userId } as ChatSession['user']) : null,
      museumId: input.museumId ?? null,
      museumName: input.museumName ?? null,
      title: input.museumName ?? null,
      coordinates: input.coordinates ?? null,
      visitContext: input.visitContext ?? null,
    });

    return await this.sessionRepo.save(session);
  }

  /**
   * Retrieves a chat session by its ID, including the owning user relation.
   *
   * @param sessionId - UUID of the session.
   * @returns The session or `null` if not found.
   */
  async getSessionById(sessionId: string): Promise<ChatSession | null> {
    return await this.sessionRepo.findOne({
      where: { id: sessionId },
      relations: {
        user: true,
      },
    });
  }

  /**
   * Retrieves a message together with its session and owning user.
   *
   * @param messageId - UUID of the message.
   * @returns The message with session ownership info, or `null` if not found.
   */
  async getMessageById(messageId: string): Promise<ChatMessageWithSessionOwnership | null> {
    const message = await this.messageRepo.findOne({
      where: { id: messageId },
      relations: {
        session: {
          user: true,
        },
      },
    });

    if (!message?.session) {
      return null;
    }

    return {
      message,
      session: message.session,
    };
  }

  /**
   * Deletes a session only if it contains no messages (transactional).
   *
   * @param sessionId - UUID of the session to delete.
   * @returns `true` if the session was deleted, `false` otherwise.
   */
  async deleteSessionIfEmpty(sessionId: string): Promise<boolean> {
    return await this.sessionRepo.manager.transaction(async (transactionManager) => {
      const sessionRepository = transactionManager.getRepository(ChatSession);
      const messageRepository = transactionManager.getRepository(ChatMessage);

      const session = await sessionRepository.findOne({
        where: { id: sessionId },
      });

      if (!session) {
        return false;
      }

      const messageCount = await messageRepository
        .createQueryBuilder('message')
        .where('message.sessionId = :sessionId', { sessionId })
        .getCount();

      if (messageCount > 0) {
        return false;
      }

      const deletion = await sessionRepository.delete({ id: sessionId });
      return Boolean(deletion.affected && deletion.affected > 0);
    });
  }

  /**
   * Persists a chat message, optional artwork match, and session updates within the
   * provided TypeORM {@link EntityManager}. Extracted from {@link persistMessage}
   * so multi-message atomic operations (e.g. {@link persistBlockedExchange}) can
   * share the same transaction scope.
   */
  private async persistMessageWithinTx(
    transactionManager: EntityManager,
    input: PersistMessageInput,
  ): Promise<ChatMessage> {
    const messageRepository = transactionManager.getRepository(ChatMessage);
    const sessionRepository = transactionManager.getRepository(ChatSession);

    const entity = messageRepository.create({
      role: input.role,
      text: input.text ?? null,
      imageRef: input.imageRef ?? null,
      metadata: input.metadata ?? null,
      session: { id: input.sessionId } as ChatSession,
    });

    const saved = await messageRepository.save(entity);

    if (input.artworkMatch) {
      const artworkMatchRepo = transactionManager.getRepository(ArtworkMatch);
      const match = artworkMatchRepo.create({
        artworkId: input.artworkMatch.artworkId ?? null,
        title: input.artworkMatch.title ?? null,
        artist: input.artworkMatch.artist ?? null,
        confidence: input.artworkMatch.confidence ?? 0,
        source: input.artworkMatch.source ?? null,
        room: input.artworkMatch.room ?? null,
        message: { id: saved.id } as ChatMessage,
      });
      await artworkMatchRepo.save(match);
    }

    const session = await sessionRepository.findOneBy({ id: input.sessionId });
    if (session) {
      session.updatedAt = new Date();
      applySessionUpdates(session, input.sessionUpdates);
      await sessionRepository.save(session);
    }

    return saved;
  }

  /**
   * Persists a chat message, optional artwork match, and session updates in a single transaction.
   *
   * @param input - Message content, role, optional artwork match, and session update fields.
   * @returns The persisted ChatMessage entity.
   */
  async persistMessage(input: PersistMessageInput): Promise<ChatMessage> {
    return await this.messageRepo.manager.transaction((tx) =>
      this.persistMessageWithinTx(tx, input),
    );
  }

  /**
   * Atomically persists the blocked user message and the assistant refusal in one
   * transaction. If either write fails both rows are rolled back — no orphan user
   * row can survive on its own.
   *
   * @param input - User message and refusal message to persist atomically.
   * @param input.userMessage - The user's blocked attempt to persist.
   * @param input.refusal - The assistant refusal message to persist.
   * @returns The two persisted rows.
   */
  async persistBlockedExchange(input: {
    userMessage: PersistMessageInput;
    refusal: PersistMessageInput;
  }): Promise<{ userMessage: ChatMessage; refusal: ChatMessage }> {
    return await this.messageRepo.manager.transaction(async (tx) => {
      const userMessage = await this.persistMessageWithinTx(tx, input.userMessage);
      const refusal = await this.persistMessageWithinTx(tx, input.refusal);
      return { userMessage, refusal };
    });
  }

  /**
   * Lists messages for a session with cursor-based pagination (newest first, returned in chronological order).
   *
   * @param root0 - Session ID, limit, and optional cursor.
   * @param root0.sessionId - UUID of the session.
   * @param root0.limit - Maximum number of messages to return.
   * @param root0.cursor - Optional pagination cursor.
   * @returns A page of messages with `hasMore` flag and `nextCursor`.
   */
  async listSessionMessages({
    sessionId,
    limit,
    cursor,
  }: ListSessionMessagesParams): Promise<SessionMessagesPage> {
    const effectiveLimit = Math.max(1, Math.min(limit, MAX_PAGE_SIZE));
    const queryBuilder = this.messageRepo
      .createQueryBuilder('message')
      .leftJoin('message.session', 'session')
      .where('session.id = :sessionId', { sessionId })
      .orderBy('message.createdAt', 'DESC')
      .addOrderBy('message.id', 'DESC')
      .take(effectiveLimit + 1);

    if (cursor) {
      const decodedCursor = messageCursor.decode(cursor);
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
    const nextCursor = hasMore
      ? messageCursor.encode({
          createdAt: last.createdAt.toISOString(),
          id: last.id,
        })
      : null;

    return {
      messages: [...messages].reverse(),
      hasMore,
      nextCursor,
    };
  }

  /**
   * Returns the most recent messages for a session in chronological order (used for LLM history context).
   *
   * @param sessionId - UUID of the session.
   * @param limit - Maximum number of messages (clamped to 1..MAX_PAGE_SIZE).
   * @returns Array of messages ordered oldest-first.
   */
  async listSessionHistory(sessionId: string, limit: number): Promise<ChatMessage[]> {
    const rows = await this.messageRepo
      .createQueryBuilder('message')
      .leftJoin('message.session', 'session')
      .where('session.id = :sessionId', { sessionId })
      .orderBy('message.createdAt', 'DESC')
      .addOrderBy('message.id', 'DESC')
      .take(Math.max(1, Math.min(limit, MAX_PAGE_SIZE)))
      .getMany();

    return [...rows].reverse();
  }

  /**
   * Lists chat sessions for a user with cursor-based pagination, including message count and latest-message preview.
   *
   * @param root0 - User ID, limit, and optional cursor.
   * @param root0.userId - Owning user ID.
   * @param root0.limit - Maximum number of sessions to return.
   * @param root0.cursor - Optional pagination cursor.
   * @returns A page of sessions with previews, message counts, `hasMore` flag, and `nextCursor`.
   */
  async listSessions({ userId, limit, cursor }: ListSessionsParams): Promise<ChatSessionsPage> {
    const effectiveLimit = Math.max(1, Math.min(limit, MAX_PAGE_SIZE));
    const queryBuilder = this.sessionRepo
      .createQueryBuilder('session')
      .where('session."userId" = :userId', { userId })
      .orderBy('session.updatedAt', 'DESC')
      .addOrderBy('session.id', 'DESC')
      .take(effectiveLimit + 1);

    if (cursor) {
      const decodedCursor = sessionCursor.decode(cursor);
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
    const nextCursor = hasMore
      ? sessionCursor.encode({
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

    const [countBySessionId, previewBySessionId] = await Promise.all([
      fetchMessageCounts(this.messageRepo, sessionIds),
      fetchMessagePreviews(this.messageRepo, sessionIds),
    ]);

    return {
      sessions: sessions.map((session) => ({
        session,
        preview: previewBySessionId.get(session.id),
        messageCount: countBySessionId.get(session.id) ?? 0,
      })),
      hasMore,
      nextCursor,
    };
  }

  /**
   * Checks whether a report already exists for a given message and user.
   *
   * @param messageId - UUID of the message.
   * @param userId - Numeric user ID.
   * @returns `true` if a report exists.
   */
  async hasMessageReport(messageId: string, userId: number): Promise<boolean> {
    const count = await this.reportRepo.count({
      where: { message: { id: messageId }, userId },
    });
    return count > 0;
  }

  /**
   * Persists a user report against a message.
   *
   * @param input - Message ID, user ID, reason, and optional comment.
   */
  async persistMessageReport(input: PersistMessageReportInput): Promise<void> {
    const entity = this.reportRepo.create({
      message: { id: input.messageId } as ChatMessage,
      userId: input.userId,
      reason: input.reason,
      comment: input.comment ?? null,
    });

    await this.reportRepo.save(entity);
  }

  /**
   * Exports all chat sessions and messages for a user (GDPR data portability).
   *
   * @param userId - Numeric user ID.
   * @returns Structured export payload containing all sessions and their messages.
   */
  async exportUserData(userId: number): Promise<UserChatExportData> {
    return await exportUserChatData(this.sessionRepo, userId);
  }

  /**
   * Inserts or updates a feedback entry for a message/user pair.
   *
   * @param messageId - UUID of the message.
   * @param userId - Numeric user ID.
   * @param value - Feedback value ('positive' or 'negative').
   */
  async upsertMessageFeedback(
    messageId: string,
    userId: number,
    value: FeedbackValue,
  ): Promise<void> {
    await this.feedbackRepo
      .createQueryBuilder()
      .insert()
      .into(MessageFeedback)
      .values({ messageId, userId, value })
      .orUpdate(['value'], ['messageId', 'userId'])
      .execute();
  }

  /**
   * Deletes a feedback entry for a message/user pair.
   *
   * @param messageId - UUID of the message.
   * @param userId - Numeric user ID.
   */
  async deleteMessageFeedback(messageId: string, userId: number): Promise<void> {
    await this.feedbackRepo.delete({ message: { id: messageId }, userId });
  }

  /**
   * Retrieves the current feedback for a message by a user.
   *
   * @param messageId - UUID of the message.
   * @param userId - Numeric user ID.
   * @returns The feedback value, or `null` if none exists.
   */
  async getMessageFeedback(
    messageId: string,
    userId: number,
  ): Promise<{ value: FeedbackValue } | null> {
    const row = await this.feedbackRepo.findOne({
      where: { message: { id: messageId }, userId },
      select: ['value'],
    });

    if (!row) return null;
    return { value: row.value };
  }

  /**
   * Persists a TTS audio reference for a message (assistant only).
   *
   * @param messageId - UUID of the message.
   * @param input - Audio storage reference, generation timestamp, voice id.
   * @param input.audioUrl - Storage reference.
   * @param input.audioGeneratedAt - Generation timestamp.
   * @param input.audioVoice - Voice id.
   */
  async updateMessageAudio(
    messageId: string,
    input: { audioUrl: string; audioGeneratedAt: Date; audioVoice: string },
  ): Promise<void> {
    await this.messageRepo.update(
      { id: messageId },
      {
        audioUrl: input.audioUrl,
        audioGeneratedAt: input.audioGeneratedAt,
        audioVoice: input.audioVoice,
      },
    );
  }

  /**
   * Clears the cached TTS audio reference for a message.
   *
   * @param messageId - UUID of the message.
   */
  async clearMessageAudio(messageId: string): Promise<void> {
    await this.messageRepo.update(
      { id: messageId },
      { audioUrl: null, audioGeneratedAt: null, audioVoice: null },
    );
  }

  /**
   * Returns every non-null `imageRef` tied to messages whose session belongs to the user.
   *
   * Used by the GDPR right-to-erasure cleanup to reach keys that predate the
   * user-scoped S3 path format (`chat-images/user-<id>/YYYY/MM/<uuid>.ext`).
   * MUST be invoked BEFORE the user row is deleted (CASCADE wipes messages/sessions).
   *
   * @param userId - Numeric user ID.
   * @returns De-duplicated list of storage refs (e.g. `s3://chat-images/...`).
   */
  async findLegacyImageRefsByUserId(userId: number): Promise<string[]> {
    const rows = await this.messageRepo
      .createQueryBuilder('message')
      .select('message.imageRef', 'imageRef')
      .innerJoin('message.session', 'session')
      .where('session.userId = :userId', { userId })
      .andWhere('message.imageRef IS NOT NULL')
      .getRawMany<{ imageRef: string | null }>();

    const refs = rows
      .map((row) => row.imageRef)
      .filter((ref): ref is string => typeof ref === 'string' && ref.length > 0);

    return Array.from(new Set(refs));
  }
}
