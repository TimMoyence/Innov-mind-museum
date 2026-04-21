import { randomUUID } from 'crypto';

import { ChatService } from '@modules/chat/useCase/chat.service';
import type {
  ChatSessionsPage,
  ChatRepository,
  ChatMessageWithSessionOwnership,
  ListSessionsParams,
  ListSessionMessagesParams,
  PersistArtworkMatchInput,
  PersistMessageInput,
  PersistMessageReportInput,
  SessionMessagesPage,
  UserChatExportData,
} from '@modules/chat/domain/chat.repository.interface';
import type { CreateSessionInput } from '@modules/chat/domain/chat.types';
import type { FeedbackValue } from '@modules/chat/domain/messageFeedback.entity';
import { ChatMessage } from '@modules/chat/domain/chatMessage.entity';
import { ChatSession } from '@modules/chat/domain/chatSession.entity';
import { LocalImageStorage } from '@modules/chat/adapters/secondary/image-storage.stub';
import type {
  ChatOrchestrator,
  OrchestratorOutput,
} from '@modules/chat/domain/ports/chat-orchestrator.port';
import type { AudioTranscriber } from '@modules/chat/domain/ports/audio-transcriber.port';
import type { TextToSpeechService } from '@modules/chat/adapters/secondary/text-to-speech.openai';
import type { OcrService } from '@modules/chat/adapters/secondary/ocr-service';
import type { ArtTopicClassifierPort } from '@modules/chat/useCase/guardrail-evaluation.service';
import type { CacheService } from '@shared/cache/cache.port';

/** Test utility: in-memory ChatRepository implementation that stores sessions and messages in Maps. */
class InMemoryChatRepository implements ChatRepository {
  private readonly sessions = new Map<string, ChatSession>();
  private readonly messages = new Map<string, ChatMessage[]>();
  private readonly artworkMatches: PersistArtworkMatchInput[] = [];
  private readonly reports = new Map<string, Set<number>>();
  private readonly feedback = new Map<string, FeedbackValue>();

  private decodeCursor(cursor: string): { updatedAt: string; id: string } | null {
    try {
      const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
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
  }

  private encodeCursor(value: { updatedAt: string; id: string }): string {
    return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
  }

  async createSession(input: CreateSessionInput): Promise<ChatSession> {
    const now = new Date();
    const session = {
      id: randomUUID(),
      locale: input.locale || null,
      museumMode: input.museumMode ?? false,
      user: input.userId ? ({ id: input.userId } as ChatSession['user']) : null,
      messages: [],
      version: 1,
      createdAt: now,
      updatedAt: now,
    } as ChatSession;

    this.sessions.set(session.id, session);
    this.messages.set(session.id, []);

    return session;
  }

  async getSessionById(sessionId: string): Promise<ChatSession | null> {
    return this.sessions.get(sessionId) || null;
  }

  async getMessageById(messageId: string): Promise<ChatMessageWithSessionOwnership | null> {
    for (const [sessionId, rows] of this.messages.entries()) {
      const row = rows.find((message) => message.id === messageId);
      if (!row) {
        continue;
      }

      const session = this.sessions.get(sessionId);
      if (!session) {
        return null;
      }

      return {
        message: {
          ...row,
          session,
        } as ChatMessage,
        session,
      };
    }

    return null;
  }

  async deleteSessionIfEmpty(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    const messages = this.messages.get(sessionId) || [];
    if (messages.length > 0) {
      return false;
    }

    this.messages.delete(sessionId);
    this.sessions.delete(sessionId);
    return true;
  }

  async persistMessage(input: PersistMessageInput): Promise<ChatMessage> {
    const row = {
      id: randomUUID(),
      role: input.role,
      text: input.text || null,
      imageRef: input.imageRef || null,
      metadata: input.metadata || null,
      createdAt: new Date(),
      session: { id: input.sessionId } as ChatSession,
      sessionId: input.sessionId,
      artworkMatches: [],
    } as ChatMessage;

    const list = this.messages.get(input.sessionId) || [];
    list.push(row);
    this.messages.set(input.sessionId, list);

    if (input.artworkMatch) {
      this.artworkMatches.push({ messageId: row.id, ...input.artworkMatch });
    }

    const session = this.sessions.get(input.sessionId);
    if (session) {
      session.updatedAt = new Date();
      if (input.sessionUpdates) {
        if (input.sessionUpdates.title !== undefined) session.title = input.sessionUpdates.title;
        if (input.sessionUpdates.museumName !== undefined)
          session.museumName = input.sessionUpdates.museumName;
        if (input.sessionUpdates.visitContext !== undefined)
          session.visitContext = input.sessionUpdates.visitContext;
        session.version = (session.version || 1) + 1;
      }
      this.sessions.set(input.sessionId, session);
    }

    return row;
  }

  /**
   * @param input
   * @deprecated Use artworkMatch field in persistMessage
   */
  async persistArtworkMatch(input: PersistArtworkMatchInput): Promise<void> {
    this.artworkMatches.push(input);
  }

  async listSessionMessages(params: ListSessionMessagesParams): Promise<SessionMessagesPage> {
    const list = [...(this.messages.get(params.sessionId) || [])].sort(
      (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
    );

    const limit = Math.max(1, Math.min(params.limit, 50));

    return {
      messages: list.slice(-limit),
      hasMore: list.length > limit,
      nextCursor: null,
    };
  }

  async listSessionHistory(sessionId: string, limit: number): Promise<ChatMessage[]> {
    const list = [...(this.messages.get(sessionId) || [])].sort(
      (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
    );

    return list.slice(-Math.max(1, Math.min(limit, 50)));
  }

  async hasMessageReport(messageId: string, userId: number): Promise<boolean> {
    return this.reports.get(messageId)?.has(userId) ?? false;
  }

  async persistMessageReport(input: PersistMessageReportInput): Promise<void> {
    const set = this.reports.get(input.messageId) ?? new Set<number>();
    set.add(input.userId);
    this.reports.set(input.messageId, set);
  }

  async exportUserData(userId: number): Promise<UserChatExportData> {
    const sessions = [...this.sessions.values()]
      .filter((session) => session.user?.id === userId)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());

    return {
      sessions: sessions.map((session) => {
        const messages = this.messages.get(session.id) || [];
        return {
          id: session.id,
          locale: session.locale,
          museumMode: session.museumMode,
          title: session.title ?? null,
          museumName: session.museumName ?? null,
          createdAt: session.createdAt.toISOString(),
          updatedAt: session.updatedAt.toISOString(),
          messages: messages.map((msg) => ({
            id: msg.id,
            role: msg.role,
            text: msg.text,
            imageRef: msg.imageRef,
            createdAt: msg.createdAt.toISOString(),
            metadata: msg.metadata,
          })),
        };
      }),
    };
  }

  async upsertMessageFeedback(
    messageId: string,
    userId: number,
    value: FeedbackValue,
  ): Promise<void> {
    this.feedback.set(`${messageId}:${String(userId)}`, value);
  }

  async deleteMessageFeedback(messageId: string, userId: number): Promise<void> {
    this.feedback.delete(`${messageId}:${String(userId)}`);
  }

  async getMessageFeedback(
    messageId: string,
    userId: number,
  ): Promise<{ value: FeedbackValue } | null> {
    const value = this.feedback.get(`${messageId}:${String(userId)}`);
    return value ? { value } : null;
  }

  async updateMessageAudio(
    messageId: string,
    input: { audioUrl: string; audioGeneratedAt: Date; audioVoice: string },
  ): Promise<void> {
    const message = this.findMessage(messageId);
    if (!message) return;
    message.audioUrl = input.audioUrl;
    message.audioGeneratedAt = input.audioGeneratedAt;
    message.audioVoice = input.audioVoice;
  }

  async clearMessageAudio(messageId: string): Promise<void> {
    const message = this.findMessage(messageId);
    if (!message) return;
    message.audioUrl = null;
    message.audioGeneratedAt = null;
    message.audioVoice = null;
  }

  private findMessage(messageId: string): ChatMessage | undefined {
    for (const list of this.messages.values()) {
      const found = list.find((m) => m.id === messageId);
      if (found) return found;
    }
    return undefined;
  }

  async listSessions(params: ListSessionsParams): Promise<ChatSessionsPage> {
    const limit = Math.max(1, Math.min(params.limit, 50));
    let sessions = [...this.sessions.values()]
      .filter((session) => session.user?.id === params.userId)
      .sort((left, right) => {
        const byTime = right.updatedAt.getTime() - left.updatedAt.getTime();
        if (byTime !== 0) return byTime;
        return right.id.localeCompare(left.id);
      });

    if (params.cursor) {
      const decodedCursor = this.decodeCursor(params.cursor);
      if (decodedCursor) {
        sessions = sessions.filter((session) => {
          const sessionTime = session.updatedAt.toISOString();
          if (sessionTime < decodedCursor.updatedAt) return true;
          if (sessionTime > decodedCursor.updatedAt) return false;
          return session.id < decodedCursor.id;
        });
      }
    }

    const hasMore = sessions.length > limit;
    const currentPage = hasMore ? sessions.slice(0, limit) : sessions;
    const last = currentPage[currentPage.length - 1];
    const nextCursor =
      hasMore && last
        ? this.encodeCursor({
            updatedAt: last.updatedAt.toISOString(),
            id: last.id,
          })
        : null;

    return {
      sessions: currentPage.map((session) => {
        const messages = this.messages.get(session.id) || [];
        const preview = [...messages]
          .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
          .at(0);

        return {
          session,
          preview: preview
            ? {
                role: preview.role,
                text: preview.text,
                createdAt: preview.createdAt,
              }
            : undefined,
          messageCount: messages.length,
        };
      }),
      hasMore,
      nextCursor,
    };
  }
}

/** Test utility: stub ChatOrchestrator that returns a deterministic synthetic response. */
class FakeOrchestrator implements ChatOrchestrator {
  private readonly fakeOutput: OrchestratorOutput = {
    text: 'Synthetic assistant response',
    metadata: {
      detectedArtwork: {
        title: 'Mock Artwork',
        artist: 'Mock Artist',
        confidence: 0.8,
        source: 'test',
      },
      citations: ['test-citation'],
    },
  };

  async generate(): Promise<OrchestratorOutput> {
    return this.fakeOutput;
  }

  async generateStream(
    _input: unknown,
    onChunk: (text: string) => void,
  ): Promise<OrchestratorOutput> {
    onChunk(this.fakeOutput.text);
    return this.fakeOutput;
  }
}

interface BuildChatTestServiceOptions {
  orchestrator?: ChatOrchestrator;
  audioTranscriber?: AudioTranscriber;
  tts?: TextToSpeechService;
  cache?: CacheService;
  ocr?: OcrService;
  artTopicClassifier?: ArtTopicClassifierPort;
}

/**
 * Test utility: builds a ChatService wired with in-memory repository, local image storage, and optional fake orchestrator.
 * Supports legacy positional args and new options object.
 * @param orchestrator
 * @param audioTranscriber
 */
export function buildChatTestService(
  orchestrator?: ChatOrchestrator,
  audioTranscriber?: AudioTranscriber,
): ChatService;
export function buildChatTestService(options: BuildChatTestServiceOptions): ChatService;
export function buildChatTestService(
  arg1?: ChatOrchestrator | BuildChatTestServiceOptions,
  arg2?: AudioTranscriber,
): ChatService {
  const isOptions = arg1 !== undefined && typeof arg1 === 'object' && !('generate' in arg1);

  if (isOptions) {
    const opts = arg1;
    return new ChatService({
      repository: new InMemoryChatRepository(),
      orchestrator: opts.orchestrator ?? new FakeOrchestrator(),
      imageStorage: new LocalImageStorage(),
      audioTranscriber: opts.audioTranscriber,
      tts: opts.tts,
      cache: opts.cache,
      ocr: opts.ocr,
      artTopicClassifier: opts.artTopicClassifier,
    });
  }

  return new ChatService({
    repository: new InMemoryChatRepository(),
    orchestrator: arg1! ?? new FakeOrchestrator(),
    imageStorage: new LocalImageStorage(),
    audioTranscriber: arg2,
  });
}
