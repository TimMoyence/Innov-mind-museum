import { openApiRequest } from '@/shared/api/openapiClient';

import type {
  DeleteSessionResponseDTO,
  GetSessionResponseDTO,
  ListSessionsRequestDTO,
  ListSessionsResponseDTO,
  ReportMessageResponseDTO,
  ReportReason,
} from '../../domain/contracts';
import {
  isDeleteSessionResponseDTO,
  isGetSessionResponseDTO,
  isListSessionsResponseDTO,
  isReportMessageResponseDTO,
} from '../../domain/contracts';
import { ensureContract } from './_internals';

/** Fetches a session with its messages (up to 50 per page). */
export const getSession = async (sessionId: string): Promise<GetSessionResponseDTO> => {
  const data = await openApiRequest({
    path: '/api/chat/sessions/{id}',
    method: 'get',
    pathParams: { id: sessionId },
    query: { limit: 50 },
  });

  return ensureContract(data, isGetSessionResponseDTO, 'get-session');
};

/** Deletes a session (typically only when it has no messages). */
export const deleteSessionIfEmpty = async (
  sessionId: string,
): Promise<DeleteSessionResponseDTO> => {
  const data = await openApiRequest({
    path: '/api/chat/sessions/{id}',
    method: 'delete',
    pathParams: { id: sessionId },
  });

  return ensureContract(data, isDeleteSessionResponseDTO, 'delete-session');
};

/** Lists chat sessions with cursor-based pagination. */
export const listSessions = async (
  params: ListSessionsRequestDTO = {},
): Promise<ListSessionsResponseDTO> => {
  const data = await openApiRequest({
    path: '/api/chat/sessions',
    method: 'get',
    query: {
      cursor: params.cursor,
      limit: params.limit,
    },
  });

  return ensureContract(data, isListSessionsResponseDTO, 'list-sessions');
};

/** Reports a message for moderation. */
export const reportMessage = async (params: {
  messageId: string;
  reason: ReportReason;
  comment?: string;
}): Promise<ReportMessageResponseDTO> => {
  const data = await openApiRequest({
    path: '/api/chat/messages/{messageId}/report',
    method: 'post',
    pathParams: { messageId: params.messageId },
    body: JSON.stringify({
      reason: params.reason,
      comment: params.comment,
    }),
  });

  return ensureContract(data, isReportMessageResponseDTO, 'report-message');
};

/**
 * Sets or toggles feedback (thumbs up/down) on an assistant message. The
 * server returns `created`, `updated`, or `removed` so callers can mirror
 * the change to their local store.
 */
export const setMessageFeedback = async (
  messageId: string,
  value: 'positive' | 'negative',
): Promise<{ messageId: string; status: string }> => {
  const data = await openApiRequest({
    path: '/api/chat/messages/{messageId}/feedback',
    method: 'post',
    pathParams: { messageId },
    body: JSON.stringify({ value }),
  });

  return data as { messageId: string; status: string };
};

/**
 * W3 (T5.3) — patches the intra-musée context (`currentArtworkId` /
 * `currentRoom`) on a chat session after a cartel deeplink scan. Both fields
 * are optional + nullable: omit = keep, `null` = clear, `string` = set.
 *
 * Returns the BE-confirmed post-write state so the caller can update local
 * UI immediately without an extra round-trip.
 *
 * Spec: docs/team-state/2026-05-17-w3-geo-walk-intra/spec.md R19/R20.
 */
export interface SetSessionContextResult {
  readonly sessionId: string;
  readonly currentArtworkId: string | null;
  readonly currentRoom: string | null;
}

export const setSessionContext = async (params: {
  sessionId: string;
  /** Omit to leave untouched, `null` to clear, `string` to set. UUID v4 required. */
  currentArtworkId?: string | null;
  /** Omit to leave untouched, `null` to clear, `string` to set. UUID v4 required. */
  currentRoom?: string | null;
}): Promise<SetSessionContextResult> => {
  // Build body explicitly so `undefined` ≠ `null` semantics survive JSON.stringify.
  const body: Record<string, string | null> = {};
  if (Object.prototype.hasOwnProperty.call(params, 'currentArtworkId')) {
    body.currentArtworkId = params.currentArtworkId ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(params, 'currentRoom')) {
    body.currentRoom = params.currentRoom ?? null;
  }
  const data = await openApiRequest({
    path: '/api/chat/sessions/{id}/context',
    method: 'patch',
    pathParams: { id: params.sessionId },
    body: JSON.stringify(body),
  });
  return data as SetSessionContextResult;
};
