import { badRequest } from '@shared/errors/app.error';

import type {
  ChatMessageResponse,
  PaginationInfo,
  SessionInfo,
  VisitorContext,
} from './chat.shared-types';
import type { ReportReason } from '../../../domain/chat.types';

// Re-export shared types so existing consumers keep working
export type {
  ChatMessageResponse,
  PaginationInfo,
  SessionInfo,
  VisitorContext,
} from './chat.shared-types';

type RecordValue = Record<string, unknown>;

const isRecord = (value: unknown): value is RecordValue => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const optionalString = (payload: RecordValue, key: string): string | undefined => {
  const value = payload[key];
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw badRequest(`${key} must be a string`);
  }
  return value;
};

const optionalBoolean = (payload: RecordValue, key: string): boolean | undefined => {
  const value = payload[key];
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  throw badRequest(`${key} must be a boolean`);
};

const optionalNumber = (payload: RecordValue, key: string): number | undefined => {
  const value = payload[key];
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  throw badRequest(`${key} must be a number`);
};

/** Validated body for `POST /sessions`. */
export interface CreateSessionRequest {
  userId?: number;
  locale?: string;
  museumMode?: boolean;
  museumId?: number;
}

/** Response shape for `POST /sessions`. */
export interface CreateSessionResponse {
  session: SessionInfo;
}

/** Validated body for `POST /sessions/:id/messages`. */
export interface PostMessageRequest {
  text?: string;
  image?: string;
  context?: VisitorContext;
}

/** Response shape for `POST /sessions/:id/messages`. */
export interface PostMessageResponse {
  sessionId: string;
  message: {
    id: string;
    role: 'assistant';
    text: string;
    createdAt: string;
  };
  metadata: {
    detectedArtwork?: {
      artworkId?: string;
      title?: string;
      artist?: string;
      confidence?: number;
      source?: string;
      museum?: string;
      room?: string;
    };
    recommendations?: string[];
    expertiseSignal?: string;
    citations?: string[];
    deeperContext?: string;
    openQuestion?: string;
    followUpQuestions?: string[];
    imageDescription?: string;
  };
}

/** Response shape for `POST /sessions/:id/audio` — extends {@link PostMessageResponse} with transcription data. */
export interface PostAudioMessageResponse extends PostMessageResponse {
  transcription: {
    text: string;
    model: string;
    provider: 'openai';
  };
}

/** Response shape for `GET /sessions/:id` (session metadata + paginated messages). */
export interface GetSessionResponse {
  session: SessionInfo;
  messages: ChatMessageResponse[];
  page: PaginationInfo;
}

/** Validated query parameters for `GET /sessions`. */
export interface ListSessionsQuery {
  cursor?: string;
  limit?: number;
}

/** Response shape for `GET /sessions` (paginated session list with previews). */
export interface ListSessionsResponse {
  sessions: (SessionInfo & {
    preview?: {
      text: string;
      createdAt: string;
      role: 'user' | 'assistant' | 'system';
    };
    messageCount: number;
  })[];
  page: PaginationInfo;
}

/** Response shape for `DELETE /sessions/:id`. */
export interface DeleteSessionResponse {
  sessionId: string;
  deleted: boolean;
}

/** Validated body for `POST /messages/:messageId/report`. */
export interface ReportMessageRequest {
  reason: ReportReason;
  comment?: string;
}

/** Response shape for `POST /messages/:messageId/report`. */
export interface ReportMessageResponse {
  messageId: string;
  reported: boolean;
}

/** Standard API error envelope returned by all chat endpoints on failure. */
export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    requestId?: string;
    details?: unknown;
  };
}

/** Validates and transforms a raw request body into a {@link CreateSessionRequest}. */
export const parseCreateSessionRequest = (payload: unknown): CreateSessionRequest => {
  if (!isRecord(payload)) {
    throw badRequest('Payload must be an object');
  }

  const museumId = optionalNumber(payload, 'museumId');
  if (museumId !== undefined && (!Number.isInteger(museumId) || museumId <= 0)) {
    throw badRequest('museumId must be a positive integer');
  }

  return {
    userId: optionalNumber(payload, 'userId'),
    locale: optionalString(payload, 'locale'),
    museumMode: optionalBoolean(payload, 'museumMode'),
    museumId,
  };
};

/** Validates and transforms a raw request body into a {@link PostMessageRequest}. */
export const parsePostMessageRequest = (payload: unknown): PostMessageRequest => {
  if (!isRecord(payload)) {
    throw badRequest('Payload must be an object');
  }

  const contextRaw = payload.context;
  let context: PostMessageRequest['context'];

  if (contextRaw !== undefined) {
    if (!isRecord(contextRaw)) {
      throw badRequest('context must be an object');
    }

    const guideLevelRaw = contextRaw.guideLevel;
    let guideLevel: 'beginner' | 'intermediate' | 'expert' | undefined;
    if (guideLevelRaw !== undefined && guideLevelRaw !== null && guideLevelRaw !== '') {
      if (typeof guideLevelRaw !== 'string') {
        throw badRequest('context.guideLevel must be a string');
      }
      if (!['beginner', 'intermediate', 'expert'].includes(guideLevelRaw)) {
        throw badRequest('context.guideLevel must be beginner, intermediate, or expert');
      }
      guideLevel = guideLevelRaw as 'beginner' | 'intermediate' | 'expert';
    }

    context = {
      location: optionalString(contextRaw, 'location'),
      museumMode: optionalBoolean(contextRaw, 'museumMode'),
      guideLevel,
      locale: optionalString(contextRaw, 'locale'),
    };
  }

  return {
    text: optionalString(payload, 'text'),
    image: optionalString(payload, 'image'),
    context,
  };
};

/** Validates and transforms raw query params into a {@link ListSessionsQuery}. */
export const parseListSessionsQuery = (payload: unknown): ListSessionsQuery => {
  if (!isRecord(payload)) {
    throw badRequest('Query must be an object');
  }

  const cursorRaw = payload.cursor;
  const limitRaw = payload.limit;

  if (cursorRaw !== undefined && typeof cursorRaw !== 'string') {
    throw badRequest('cursor must be a string');
  }

  if (limitRaw !== undefined && typeof limitRaw !== 'string' && typeof limitRaw !== 'number') {
    throw badRequest('limit must be a number');
  }

  return {
    cursor: cursorRaw,
    limit:
      limitRaw === undefined || limitRaw === ''
        ? undefined
        : optionalNumber({ limit: limitRaw }, 'limit'),
  };
};

const isStringArray = (value: unknown): value is string[] => {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
};

/** Type guard verifying a payload conforms to {@link CreateSessionResponse}. */
export const isCreateSessionResponse = (payload: unknown): payload is CreateSessionResponse => {
  if (!isRecord(payload) || !isRecord(payload.session)) return false;
  return (
    typeof payload.session.id === 'string' &&
    typeof payload.session.museumMode === 'boolean' &&
    typeof payload.session.createdAt === 'string' &&
    typeof payload.session.updatedAt === 'string'
  );
};

/** Type guard verifying a payload conforms to {@link PostMessageResponse}. */
export const isPostMessageResponse = (payload: unknown): payload is PostMessageResponse => {
  if (!isRecord(payload) || !isRecord(payload.message) || !isRecord(payload.metadata)) {
    return false;
  }

  const message = payload.message;
  return (
    typeof payload.sessionId === 'string' &&
    message.role === 'assistant' &&
    typeof message.id === 'string' &&
    typeof message.text === 'string' &&
    typeof message.createdAt === 'string' &&
    (!('citations' in payload.metadata) || isStringArray(payload.metadata.citations))
  );
};

/** Type guard verifying a payload conforms to {@link PostAudioMessageResponse}. */
export const isPostAudioMessageResponse = (
  payload: unknown,
): payload is PostAudioMessageResponse => {
  if (!isPostMessageResponse(payload)) {
    return false;
  }

  const record = payload as unknown as RecordValue;
  if (!isRecord(record.transcription)) {
    return false;
  }

  return (
    typeof record.transcription.text === 'string' &&
    typeof record.transcription.model === 'string' &&
    record.transcription.provider === 'openai'
  );
};

/** Type guard verifying a payload conforms to {@link GetSessionResponse}. */
export const isGetSessionResponse = (
  payload: unknown,
  // eslint-disable-next-line complexity -- type guard must check many fields
): payload is GetSessionResponse => {
  if (
    !isRecord(payload) ||
    !isRecord(payload.session) ||
    !Array.isArray(payload.messages) ||
    !isRecord(payload.page)
  ) {
    return false;
  }

  if (
    typeof payload.session.id !== 'string' ||
    typeof payload.session.museumMode !== 'boolean' ||
    typeof payload.session.createdAt !== 'string' ||
    typeof payload.session.updatedAt !== 'string'
  ) {
    return false;
  }

  if (
    !(payload.page.nextCursor === null || typeof payload.page.nextCursor === 'string') ||
    typeof payload.page.hasMore !== 'boolean' ||
    typeof payload.page.limit !== 'number'
  ) {
    return false;
  }

  return payload.messages.every((item) => {
    if (!isRecord(item)) return false;
    if (item.image !== undefined && item.image !== null) {
      if (!isRecord(item.image)) return false;
      if (typeof item.image.url !== 'string' || typeof item.image.expiresAt !== 'string') {
        return false;
      }
    }
    return (
      typeof item.id === 'string' &&
      ['user', 'assistant', 'system'].includes(String(item.role)) &&
      typeof item.createdAt === 'string'
    );
  });
};

/** Type guard verifying a payload conforms to {@link DeleteSessionResponse}. */
export const isDeleteSessionResponse = (payload: unknown): payload is DeleteSessionResponse => {
  if (!isRecord(payload)) {
    return false;
  }

  return typeof payload.sessionId === 'string' && typeof payload.deleted === 'boolean';
};

/** Validates and transforms a raw request body into a {@link ReportMessageRequest}. */
export const parseReportMessageRequest = (payload: unknown): ReportMessageRequest => {
  if (!isRecord(payload)) {
    throw badRequest('Payload must be an object');
  }

  const reason = payload.reason;
  if (typeof reason !== 'string' || !reason.trim()) {
    throw badRequest('reason is required');
  }

  const allowedReasons: ReportReason[] = ['offensive', 'inaccurate', 'inappropriate', 'other'];
  if (!allowedReasons.includes(reason as ReportReason)) {
    throw badRequest('reason must be offensive, inaccurate, inappropriate, or other');
  }

  const comment = optionalString(payload, 'comment');
  if (comment && comment.length > 500) {
    throw badRequest('comment must be 500 characters or fewer');
  }

  return {
    reason: reason as ReportReason,
    comment,
  };
};

/** Type guard verifying a payload conforms to {@link ReportMessageResponse}. */
export const isReportMessageResponse = (payload: unknown): payload is ReportMessageResponse => {
  if (!isRecord(payload)) {
    return false;
  }

  return typeof payload.messageId === 'string' && typeof payload.reported === 'boolean';
};

/** Type guard verifying a payload conforms to {@link ListSessionsResponse}. */
export const isListSessionsResponse = (payload: unknown): payload is ListSessionsResponse => {
  if (!isRecord(payload) || !Array.isArray(payload.sessions) || !isRecord(payload.page)) {
    return false;
  }

  if (
    !(payload.page.nextCursor === null || typeof payload.page.nextCursor === 'string') ||
    typeof payload.page.hasMore !== 'boolean' ||
    typeof payload.page.limit !== 'number'
  ) {
    return false;
  }

  return payload.sessions.every((item) => {
    if (!isRecord(item)) return false;

    if (
      typeof item.id !== 'string' ||
      typeof item.museumMode !== 'boolean' ||
      typeof item.createdAt !== 'string' ||
      typeof item.updatedAt !== 'string' ||
      typeof item.messageCount !== 'number'
    ) {
      return false;
    }

    if (item.preview !== undefined) {
      if (!isRecord(item.preview)) return false;
      if (
        typeof item.preview.text !== 'string' ||
        typeof item.preview.createdAt !== 'string' ||
        !['user', 'assistant', 'system'].includes(String(item.preview.role))
      ) {
        return false;
      }
    }

    return true;
  });
};
