import { badRequest } from '@shared/errors/app.error';

import type {
  ChatMessageResponse,
  PaginationInfo,
  SessionInfo,
  VisitorContext,
} from './chat.shared-types';
import type { ReportReason } from '../../../domain/chat.types';
import type { FeedbackValue } from '../../../domain/messageFeedback.entity';

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
  museumName?: string;
  museumAddress?: string;
  coordinates?: { lat: number; lng: number };
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

/** Validated body for `POST /messages/:messageId/feedback`. */
export interface FeedbackMessageRequest {
  value: FeedbackValue;
}

/** Response shape for `POST /messages/:messageId/feedback`. */
export interface FeedbackMessageResponse {
  messageId: string;
  status: 'created' | 'updated' | 'removed';
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

const parseOptionalCoordinates = (
  payload: RecordValue,
): { lat: number; lng: number } | undefined => {
  const raw = payload.coordinates;
  if (raw === undefined || raw === null) return undefined;
  if (!isRecord(raw)) throw badRequest('coordinates must be an object with lat and lng');
  const lat = typeof raw.lat === 'number' ? raw.lat : Number.NaN;
  const lng = typeof raw.lng === 'number' ? raw.lng : Number.NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw badRequest('coordinates.lat and coordinates.lng must be finite numbers');
  }
  if (lat < -90 || lat > 90) throw badRequest('coordinates.lat must be between -90 and 90');
  if (lng < -180 || lng > 180) throw badRequest('coordinates.lng must be between -180 and 180');
  return { lat, lng };
};

/** Validates and transforms a raw request body into a {@link CreateSessionRequest}. */
export const parseCreateSessionRequest = (payload: unknown): CreateSessionRequest => {
  if (!isRecord(payload)) {
    throw badRequest('Payload must be an object');
  }

  const museumId = optionalNumber(payload, 'museumId');
  if (museumId !== undefined && (!Number.isInteger(museumId) || museumId <= 0)) {
    throw badRequest('museumId must be a positive integer');
  }

  const coordinates = parseOptionalCoordinates(payload);

  return {
    userId: optionalNumber(payload, 'userId'),
    locale: optionalString(payload, 'locale'),
    museumMode: optionalBoolean(payload, 'museumMode'),
    museumId,
    museumName: optionalString(payload, 'museumName'),
    museumAddress: optionalString(payload, 'museumAddress'),
    coordinates,
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

/** Validates and transforms a raw request body into a {@link FeedbackMessageRequest}. */
export const parseFeedbackMessageRequest = (payload: unknown): FeedbackMessageRequest => {
  if (!isRecord(payload)) {
    throw badRequest('Payload must be an object');
  }

  const value = payload.value;
  if (typeof value !== 'string' || !value.trim()) {
    throw badRequest('value is required');
  }

  const allowedValues: FeedbackValue[] = ['positive', 'negative'];
  if (!allowedValues.includes(value as FeedbackValue)) {
    throw badRequest('value must be positive or negative');
  }

  return { value: value as FeedbackValue };
};

// Re-export type guards from dedicated module
export {
  isCreateSessionResponse,
  isPostMessageResponse,
  isPostAudioMessageResponse,
  isGetSessionResponse,
  isDeleteSessionResponse,
  isFeedbackMessageResponse,
  isReportMessageResponse,
  isListSessionsResponse,
} from './chat.type-guards';
