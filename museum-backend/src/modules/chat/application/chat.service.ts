import { validate as isUuid } from 'uuid';

import { env } from '@src/config/env';
import { badRequest, notFound } from '@shared/errors/app.error';
import {
  assertImageSize,
  assertMimeType,
  decodeBase64Image,
  isSafeImageUrl,
} from './image-input';
import {
  ChatAssistantMetadata,
  CreateSessionInput,
  MessagePageQuery,
  PostMessageInput,
} from '../domain/chat.types';
import {
  ChatRepository,
  ChatSessionsPage,
  SessionMessagesPage,
} from '../domain/chat.repository.interface';
import { ImageStorage } from '../adapters/secondary/image-storage.stub';
import {
  ChatOrchestrator,
  OrchestratorOutput,
} from '../adapters/secondary/langchain.orchestrator';

export interface CreateSessionResult {
  id: string;
  locale?: string | null;
  museumMode: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PostMessageResult {
  sessionId: string;
  message: {
    id: string;
    role: 'assistant';
    text: string;
    createdAt: string;
  };
  metadata: ChatAssistantMetadata;
}

export interface SessionResult {
  session: CreateSessionResult;
  messages: Array<{
    id: string;
    role: 'user' | 'assistant' | 'system';
    text?: string | null;
    imageRef?: string | null;
    createdAt: string;
    metadata?: Record<string, unknown> | null;
  }>;
  page: {
    nextCursor: string | null;
    hasMore: boolean;
    limit: number;
  };
}

export interface ListSessionsResult {
  sessions: Array<{
    id: string;
    locale?: string | null;
    museumMode: boolean;
    createdAt: string;
    updatedAt: string;
    preview?: {
      text: string;
      createdAt: string;
      role: 'user' | 'assistant' | 'system';
    };
    messageCount: number;
  }>;
  page: {
    nextCursor: string | null;
    hasMore: boolean;
    limit: number;
  };
}

const isValidSessionListCursor = (value: string): boolean => {
  try {
    const decoded = Buffer.from(value, 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded) as unknown;

    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as Record<string, unknown>).updatedAt === 'string' &&
      typeof (parsed as Record<string, unknown>).id === 'string'
    );
  } catch {
    return false;
  }
};

export class ChatService {
  constructor(
    private readonly repository: ChatRepository,
    private readonly orchestrator: ChatOrchestrator,
    private readonly imageStorage: ImageStorage,
  ) {}

  async createSession(input: CreateSessionInput): Promise<CreateSessionResult> {
    if (input.userId !== undefined && (!Number.isInteger(input.userId) || input.userId <= 0)) {
      throw badRequest('userId must be a positive integer');
    }

    const session = await this.repository.createSession({
      userId: input.userId,
      locale: input.locale,
      museumMode: input.museumMode,
    });

    return {
      id: session.id,
      locale: session.locale,
      museumMode: session.museumMode,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    };
  }

  async postMessage(
    sessionId: string,
    input: PostMessageInput,
    requestId?: string,
    currentUserId?: number,
  ): Promise<PostMessageResult> {
    if (!isUuid(sessionId)) {
      throw badRequest('Invalid session id format');
    }

    const session = await this.repository.getSessionById(sessionId);
    if (!session) {
      throw notFound('Chat session not found');
    }
    const ownerId = session.user?.id;
    if (ownerId && currentUserId && ownerId !== currentUserId) {
      throw notFound('Chat session not found');
    }

    const text = input.text?.trim();
    if (text && text.length > env.llm.maxTextLength) {
      throw badRequest(`text must be <= ${env.llm.maxTextLength} characters`);
    }

    if (!text && !input.image) {
      throw badRequest('Either text or image is required');
    }

    let imageRef: string | undefined;
    let orchestratorImage: PostMessageInput['image'] | undefined;

    if (input.image) {
      if (input.image.source === 'url') {
        if (!isSafeImageUrl(input.image.value)) {
          throw badRequest('Image URL must be a safe HTTPS URL');
        }

        imageRef = input.image.value;
        orchestratorImage = input.image;
      } else {
        const decoded = decodeBase64Image(input.image.value);
        assertMimeType(decoded.mimeType, env.upload.allowedMimeTypes);
        assertImageSize(decoded.sizeBytes, env.llm.maxImageBytes);

        imageRef = await this.imageStorage.save({
          base64: decoded.base64,
          mimeType: decoded.mimeType,
        });

        orchestratorImage = {
          source: input.image.source,
          value: decoded.base64,
          mimeType: decoded.mimeType,
          sizeBytes: decoded.sizeBytes,
        };
      }
    }

    await this.repository.persistMessage({
      sessionId,
      role: 'user',
      text,
      imageRef,
    });

    const history = await this.repository.listSessionHistory(
      sessionId,
      env.llm.maxHistoryMessages,
    );
    const requestedLocale = input.context?.locale?.trim();

    const aiResult: OrchestratorOutput = await this.orchestrator.generate({
      history,
      text,
      image: orchestratorImage,
      locale: requestedLocale || session.locale || undefined,
      museumMode: input.context?.museumMode ?? session.museumMode,
      context: {
        location: input.context?.location,
        guideLevel: input.context?.guideLevel,
      },
      requestId,
    });

    const assistantMessage = await this.repository.persistMessage({
      sessionId,
      role: 'assistant',
      text: aiResult.text,
      metadata: aiResult.metadata as Record<string, unknown>,
    });

    if (aiResult.metadata.detectedArtwork) {
      await this.repository.persistArtworkMatch({
        messageId: assistantMessage.id,
        artworkId: aiResult.metadata.detectedArtwork.artworkId,
        title: aiResult.metadata.detectedArtwork.title,
        artist: aiResult.metadata.detectedArtwork.artist,
        confidence: aiResult.metadata.detectedArtwork.confidence,
        source: aiResult.metadata.detectedArtwork.source,
      });
    }

    return {
      sessionId,
      message: {
        id: assistantMessage.id,
        role: 'assistant',
        text: aiResult.text,
        createdAt: assistantMessage.createdAt.toISOString(),
      },
      metadata: aiResult.metadata,
    };
  }

  async getSession(
    sessionId: string,
    page: MessagePageQuery,
    currentUserId?: number,
  ): Promise<SessionResult> {
    if (!isUuid(sessionId)) {
      throw badRequest('Invalid session id format');
    }

    const session = await this.repository.getSessionById(sessionId);
    if (!session) {
      throw notFound('Chat session not found');
    }
    const ownerId = session.user?.id;
    if (ownerId && currentUserId && ownerId !== currentUserId) {
      throw notFound('Chat session not found');
    }

    const limit = Math.max(1, Math.min(page.limit || 20, 50));

    const rows: SessionMessagesPage = await this.repository.listSessionMessages({
      sessionId,
      limit,
      cursor: page.cursor,
    });

    return {
      session: {
        id: session.id,
        locale: session.locale,
        museumMode: session.museumMode,
        createdAt: session.createdAt.toISOString(),
        updatedAt: session.updatedAt.toISOString(),
      },
      messages: rows.messages.map((message) => ({
        id: message.id,
        role: message.role,
        text: message.text,
        imageRef: message.imageRef,
        createdAt: message.createdAt.toISOString(),
        metadata: message.metadata,
      })),
      page: {
        nextCursor: rows.nextCursor,
        hasMore: rows.hasMore,
        limit,
      },
    };
  }

  async listSessions(
    page: MessagePageQuery,
    currentUserId?: number,
  ): Promise<ListSessionsResult> {
    if (!Number.isInteger(currentUserId) || Number(currentUserId) <= 0) {
      throw badRequest('Authenticated user id is required');
    }
    const userId = currentUserId as number;

    if (page.cursor && !isValidSessionListCursor(page.cursor)) {
      throw badRequest('Invalid cursor format');
    }

    const limit = Math.max(1, Math.min(page.limit || 20, 50));

    const rows: ChatSessionsPage = await this.repository.listSessions({
      userId,
      limit,
      cursor: page.cursor,
    });

    return {
      sessions: rows.sessions.map((row) => ({
        id: row.session.id,
        locale: row.session.locale,
        museumMode: row.session.museumMode,
        createdAt: row.session.createdAt.toISOString(),
        updatedAt: row.session.updatedAt.toISOString(),
        preview: row.preview
          ? {
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
  }
}
