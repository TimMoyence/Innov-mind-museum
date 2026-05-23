import { z } from 'zod';

import { ArtworkMatch } from '@modules/chat/domain/art-keyword/artworkMatch.entity';
import { ChatMessage } from '@modules/chat/domain/message/chatMessage.entity';
import { MessageFeedback } from '@modules/chat/domain/message/messageFeedback.entity';
import { MessageReport } from '@modules/chat/domain/message/messageReport.entity';
import { ChatSession } from '@modules/chat/domain/session/chatSession.entity';
import { CursorCodec } from '@shared/pagination/cursor-codec';

import {
  clearMessageAudio,
  findAudioRefsByUserId,
  findLegacyImageRefsByUserId,
  updateMessageAudio,
} from './chat-repository-audio';
import {
  deleteMessageFeedback,
  getMessageFeedback,
  listMessageFeedbackForUser,
  listMessageReportsForUser,
  upsertMessageFeedback,
} from './chat-repository-feedback';
import {
  fetchMessageCounts,
  fetchMessagePreviews,
  exportUserChatData,
} from './chat-repository-queries';

import type { CreateSessionInput } from '@modules/chat/domain/chat.types';
import type { FeedbackValue } from '@modules/chat/domain/message/messageFeedback.entity';
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
} from '@modules/chat/domain/session/chat.repository.interface';
import type { DataSource, EntityManager, Repository } from 'typeorm';

const messageCursor = new CursorCodec(z.object({ createdAt: z.string(), id: z.string() }));
const sessionCursor = new CursorCodec(z.object({ updatedAt: z.string(), id: z.string() }));

const MAX_PAGE_SIZE = 50;

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

export class TypeOrmChatRepository implements ChatRepository {
  private readonly sessionRepo: Repository<ChatSession>;
  private readonly messageRepo: Repository<ChatMessage>;
  private readonly reportRepo: Repository<MessageReport>;
  private readonly feedbackRepo: Repository<MessageFeedback>;

  constructor(dataSource: DataSource) {
    this.sessionRepo = dataSource.getRepository(ChatSession);
    this.messageRepo = dataSource.getRepository(ChatMessage);
    this.reportRepo = dataSource.getRepository(MessageReport);
    this.feedbackRepo = dataSource.getRepository(MessageFeedback);
  }

  async createSession(input: CreateSessionInput): Promise<ChatSession> {
    const session = this.sessionRepo.create({
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string fallback
      locale: input.locale || null,
      museumMode: input.museumMode ?? false,
      intent: input.intent ?? 'default',
      user: input.userId ? { id: input.userId } : null,
      museumId: input.museumId ?? null,
      museumName: input.museumName ?? null,
      title: input.museumName ?? null,
      coordinates: input.coordinates ?? null,
      visitContext: input.visitContext ?? null,
    });

    return await this.sessionRepo.save(session);
  }

  async getSessionById(sessionId: string): Promise<ChatSession | null> {
    return await this.sessionRepo.findOne({
      where: { id: sessionId },
      relations: {
        user: true,
      },
    });
  }

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

  /** Transactional — deletes only if message count is zero. */
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

  /** Shared by persistMessage + persistBlockedExchange so they can use one tx. */
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
      // PR-P0-1 (2026-05-23) — opaque LLM-cache-invalidation cookie. Goes
      // through `repository.create()` + `repository.save()` (NOT `.update().set({})`)
      // so the CLAUDE.md TypeORM `.set({ field: undefined })` silent-skip
      // gotcha is avoided.
      cacheKey: input.cacheKey ?? null,
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
        message: { id: saved.id },
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

  async persistMessage(input: PersistMessageInput): Promise<ChatMessage> {
    return await this.messageRepo.manager.transaction((tx) =>
      this.persistMessageWithinTx(tx, input),
    );
  }

  /** Atomic — both rolled back on failure (no orphan user row). */
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

  /** Cursor pagination, newest first; returned reversed to chronological order. */
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

  /** Most-recent N messages, returned oldest-first (LLM context). limit clamped to MAX_PAGE_SIZE. */
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

  /** Cursor pagination — sessions + message counts + latest-message preview. */
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

  async hasMessageReport(messageId: string, userId: number): Promise<boolean> {
    const count = await this.reportRepo.count({
      where: { message: { id: messageId }, userId },
    });
    return count > 0;
  }

  async persistMessageReport(input: PersistMessageReportInput): Promise<void> {
    const entity = this.reportRepo.create({
      message: { id: input.messageId },
      userId: input.userId,
      reason: input.reason,
      comment: input.comment ?? null,
    });

    await this.reportRepo.save(entity);
  }

  /** GDPR data portability (Art. 20). */
  async exportUserData(userId: number): Promise<UserChatExportData> {
    return await exportUserChatData(this.sessionRepo, userId);
  }

  async upsertMessageFeedback(
    messageId: string,
    userId: number,
    value: FeedbackValue,
  ): Promise<void> {
    await upsertMessageFeedback(this.feedbackRepo, messageId, userId, value);
  }

  async deleteMessageFeedback(messageId: string, userId: number): Promise<void> {
    await deleteMessageFeedback(this.feedbackRepo, messageId, userId);
  }

  async getMessageFeedback(
    messageId: string,
    userId: number,
  ): Promise<{ value: FeedbackValue } | null> {
    return await getMessageFeedback(this.feedbackRepo, messageId, userId);
  }

  async updateMessageAudio(
    messageId: string,
    input: { audioUrl: string; audioGeneratedAt: Date; audioVoice: string },
  ): Promise<void> {
    await updateMessageAudio(this.messageRepo, messageId, input);
  }

  async clearMessageAudio(messageId: string): Promise<void> {
    await clearMessageAudio(this.messageRepo, messageId);
  }

  /**
   * GDPR right-to-erasure — returns imageRefs predating user-scoped S3 paths.
   * MUST be called BEFORE user delete (CASCADE wipes messages/sessions).
   */
  async findLegacyImageRefsByUserId(userId: number): Promise<string[]> {
    return await findLegacyImageRefsByUserId(this.messageRepo, userId);
  }

  /**
   * GDPR right-to-erasure (B1) — returns the user's stored TTS audio refs. MUST
   * be called BEFORE user delete (CASCADE wipes messages/sessions).
   */
  async findAudioRefsByUserId(userId: number): Promise<string[]> {
    return await findAudioRefsByUserId(this.messageRepo, userId);
  }

  /** DSAR (Art.15/20, B3) — the user's message feedback for the export payload. */
  async listMessageFeedbackForUser(userId: number) {
    return await listMessageFeedbackForUser(this.feedbackRepo, userId);
  }

  /** DSAR (Art.15/20, B3, D7) — the user's message reports for the export payload. */
  async listMessageReportsForUser(userId: number) {
    return await listMessageReportsForUser(this.reportRepo, userId);
  }

  /**
   * W3 (T5.3) — patches the W3 intra-musée context columns on a session row.
   *
   * Implementation note (CLAUDE.md gotcha) — `repo.update(criteria, partial)`
   * forwards to `UpdateQueryBuilder.set()` which SILENTLY SKIPS `undefined`
   * fields (correct) but DOES set `null` (we want this to clear). We
   * construct the patch object explicitly so only the caller-supplied keys
   * land in the UPDATE statement.
   */
  async updateSessionContext(
    sessionId: string,
    patch: { currentArtworkId?: string | null; currentRoom?: string | null },
  ): Promise<void> {
    const updates: Partial<Pick<ChatSession, 'currentArtworkId' | 'currentRoom'>> = {};
    if (Object.prototype.hasOwnProperty.call(patch, 'currentArtworkId')) {
      updates.currentArtworkId = patch.currentArtworkId ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'currentRoom')) {
      updates.currentRoom = patch.currentRoom ?? null;
    }
    if (Object.keys(updates).length === 0) return;
    await this.sessionRepo.update({ id: sessionId }, updates);
  }
}
