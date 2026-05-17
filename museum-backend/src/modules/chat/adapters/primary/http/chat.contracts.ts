import { z } from 'zod';

import {
  createSessionSchema,
  postMessageSchema,
} from '@modules/chat/adapters/primary/http/schemas/chat-session.schemas';
import { badRequest } from '@shared/errors/app.error';
import { formatZodIssues } from '@shared/validation/zod-issue.formatter';

import type {
  ChatMessageResponse,
  PaginationInfo,
  SessionInfo,
  VisitorContext,
} from './chat.shared-types';
import type { ChatSessionIntent, ReportReason } from '@modules/chat/domain/chat.types';
import type { FeedbackValue } from '@modules/chat/domain/message/messageFeedback.entity';

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

export interface CreateSessionRequest {
  userId?: number;
  locale?: string;
  museumMode?: boolean;
  museumId?: number;
  museumName?: string;
  museumAddress?: string;
  coordinates?: { lat: number; lng: number };
  intent?: ChatSessionIntent;
}

export interface CreateSessionResponse {
  session: SessionInfo;
}

export interface PostMessageRequest {
  text?: string;
  image?: string;
  context?: VisitorContext;
}

export interface PostMessageResponse {
  sessionId: string;
  message: {
    id: string;
    role: 'assistant';
    text: string;
    createdAt: string;
    /** Walk-intent only. Sanitized, max 60 chars each. */
    suggestions?: string[];
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
    /** B3 — ≤80 chars, anchored to a fact in answer; omit when no anchor. */
    suggestedFollowUp?: string;
    imageDescription?: string;
  };
}

export interface PostAudioMessageResponse extends PostMessageResponse {
  transcription: {
    text: string;
    model: string;
    provider: 'openai';
  };
}

export interface GetSessionResponse {
  session: SessionInfo;
  messages: ChatMessageResponse[];
  page: PaginationInfo;
}

export interface ListSessionsQuery {
  cursor?: string;
  limit?: number;
}

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

export interface DeleteSessionResponse {
  sessionId: string;
  deleted: boolean;
}

export interface ReportMessageRequest {
  reason: ReportReason;
  comment?: string;
}

export interface ReportMessageResponse {
  messageId: string;
  reported: boolean;
}

export interface FeedbackMessageRequest {
  value: FeedbackValue;
}

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

export const parseCreateSessionRequest = (payload: unknown): CreateSessionRequest => {
  const result = createSessionSchema.safeParse(payload);
  if (!result.success) {
    throw badRequest(formatZodIssues(result.error.issues));
  }
  return result.data;
};

export const parsePostMessageRequest = (payload: unknown): PostMessageRequest => {
  const result = postMessageSchema.safeParse(payload);
  if (!result.success) {
    throw badRequest(formatZodIssues(result.error.issues));
  }
  return result.data as PostMessageRequest;
};

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

// GDPR Art. 22 right-to-explanation contract — see docs/GDPR_ART22_SCOPE.md + ADR-048.

export const EXPLANATION_CATEGORIES = [
  'off_topic',
  'prompt_injection',
  'pii',
  'service_unavailable',
  'unsafe_output',
] as const;

export const EXPLANATION_RECOURSE_TYPES = ['self-retry', 'signal', 'support'] as const;

const ExplanationRecourseSchema = z.object({
  type: z.enum(EXPLANATION_RECOURSE_TYPES),
  description: z.string().max(200),
  supportUrl: z.union([z.url(), z.null()]),
});

const ExplanationProvidedBySchema = z.object({
  name: z.string().min(1).max(128),
  version: z.string().min(1).max(64),
});

/** Wire schema for `GET /api/chat/messages/:id/explanation`. */
export const ExplanationResponseSchema = z.object({
  decision: z.enum(['allowed', 'blocked']),
  category: z.union([z.enum(EXPLANATION_CATEGORIES), z.null()]),
  reasonSummary: z.string().max(200),
  recourse: ExplanationRecourseSchema,
  auditRef: z.union([z.uuid(), z.null()]),
  providedBy: z.union([ExplanationProvidedBySchema, z.null()]),
  decisionAt: z.iso.datetime({ offset: true }),
  policyVersion: z.string().min(1).max(64),
});

export type ExplanationResponse = z.infer<typeof ExplanationResponseSchema>;

const ExplanationParamsSchema = z.object({
  id: z.uuid({ message: 'message id must be a UUID' }),
});

export interface ExplanationParams {
  messageId: string;
}

/** Throws 400 if `:id` is not a UUID. */
export const parseExplanationParams = (params: unknown): ExplanationParams => {
  const result = ExplanationParamsSchema.safeParse(params);
  if (!result.success) {
    throw badRequest(formatZodIssues(result.error.issues));
  }
  return { messageId: result.data.id };
};
