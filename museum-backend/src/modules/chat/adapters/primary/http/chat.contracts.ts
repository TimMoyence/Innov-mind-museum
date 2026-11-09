import { z } from 'zod';

import {
  createSessionSchema,
  postMessageSchema,
} from '@modules/chat/adapters/primary/http/schemas/chat-session.schemas';
import { invalidInput } from '@shared/errors/app.error';
import { isRecord } from '@shared/utils/is-record';
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

const optionalString = (payload: RecordValue, key: string): string | undefined => {
  const value = payload[key];
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw invalidInput(`${key} must be a string`);
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
  throw invalidInput(`${key} must be a number`);
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
    throw invalidInput(formatZodIssues(result.error.issues));
  }
  return result.data;
};

export const parsePostMessageRequest = (payload: unknown): PostMessageRequest => {
  const result = postMessageSchema.safeParse(payload);
  if (!result.success) {
    throw invalidInput(formatZodIssues(result.error.issues));
  }
  return result.data as PostMessageRequest;
};

export const parseListSessionsQuery = (payload: unknown): ListSessionsQuery => {
  if (!isRecord(payload)) {
    throw invalidInput('Query must be an object');
  }

  const cursorRaw = payload.cursor;
  const limitRaw = payload.limit;

  if (cursorRaw !== undefined && typeof cursorRaw !== 'string') {
    throw invalidInput('cursor must be a string');
  }

  if (limitRaw !== undefined && typeof limitRaw !== 'string' && typeof limitRaw !== 'number') {
    throw invalidInput('limit must be a number');
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
    throw invalidInput('Payload must be an object');
  }

  const reason = payload.reason;
  if (typeof reason !== 'string' || !reason.trim()) {
    throw invalidInput('reason is required');
  }

  const allowedReasons: ReportReason[] = ['offensive', 'inaccurate', 'inappropriate', 'other'];
  if (!allowedReasons.includes(reason as ReportReason)) {
    throw invalidInput('reason must be offensive, inaccurate, inappropriate, or other');
  }

  const comment = optionalString(payload, 'comment');
  if (comment && comment.length > 500) {
    throw invalidInput('comment must be 500 characters or fewer');
  }

  return {
    reason: reason as ReportReason,
    comment,
  };
};

export const parseFeedbackMessageRequest = (payload: unknown): FeedbackMessageRequest => {
  if (!isRecord(payload)) {
    throw invalidInput('Payload must be an object');
  }

  const value = payload.value;
  if (typeof value !== 'string' || !value.trim()) {
    throw invalidInput('value is required');
  }

  const allowedValues: FeedbackValue[] = ['positive', 'negative'];
  if (!allowedValues.includes(value as FeedbackValue)) {
    throw invalidInput('value must be positive or negative');
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
  supportUrl: z.url().nullable(),
});

const ExplanationProvidedBySchema = z.object({
  name: z.string().min(1).max(128),
  version: z.string().min(1).max(64),
});

export const ExplanationResponseSchema = z.object({
  decision: z.enum(['allowed', 'blocked']),
  category: z.enum(EXPLANATION_CATEGORIES).nullable(),
  reasonSummary: z.string().max(200),
  recourse: ExplanationRecourseSchema,
  auditRef: z.uuid().nullable(),
  providedBy: ExplanationProvidedBySchema.nullable(),
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

export const parseExplanationParams = (params: unknown): ExplanationParams => {
  const result = ExplanationParamsSchema.safeParse(params);
  if (!result.success) {
    throw invalidInput(formatZodIssues(result.error.issues));
  }
  return { messageId: result.data.id };
};
