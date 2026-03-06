import { randomUUID } from 'crypto';

import { ChatService } from '@modules/chat/application/chat.service';
import type {
  ChatSessionsPage,
  ChatRepository,
  ChatMessageWithSessionOwnership,
  ListSessionsParams,
  ListSessionMessagesParams,
  PersistArtworkMatchInput,
  PersistMessageInput,
  SessionMessagesPage,
} from '@modules/chat/domain/chat.repository.interface';
import type { CreateSessionInput } from '@modules/chat/domain/chat.types';
import { ChatMessage } from '@modules/chat/domain/chatMessage.entity';
import { ChatSession } from '@modules/chat/domain/chatSession.entity';
import { LocalImageStorage } from '@modules/chat/adapters/secondary/image-storage.stub';
import type {
  ChatOrchestrator,
  OrchestratorOutput,
} from '@modules/chat/adapters/secondary/langchain.orchestrator';

class InMemoryChatRepository implements ChatRepository {
  private readonly sessions = new Map<string, ChatSession>();
  private readonly messages = new Map<string, ChatMessage[]>();
  private readonly artworkMatches: PersistArtworkMatchInput[] = [];

  private decodeCursor(
    cursor: string,
  ): { updatedAt: string; id: string } | null {
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
      artworkMatches: [],
    } as ChatMessage;

    const list = this.messages.get(input.sessionId) || [];
    list.push(row);
    this.messages.set(input.sessionId, list);

    const session = this.sessions.get(input.sessionId);
    if (session) {
      session.updatedAt = new Date();
      this.sessions.set(input.sessionId, session);
    }

    return row;
  }

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

class FakeOrchestrator implements ChatOrchestrator {
  async generate(): Promise<OrchestratorOutput> {
    return {
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
  }
}

export const buildChatTestService = (
  orchestrator: ChatOrchestrator = new FakeOrchestrator(),
): ChatService => {
  return new ChatService(
    new InMemoryChatRepository(),
    orchestrator,
    new LocalImageStorage(),
  );
};
