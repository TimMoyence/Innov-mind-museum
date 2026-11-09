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

export const getSession = async (sessionId: string): Promise<GetSessionResponseDTO> => {
  const data = await openApiRequest({
    path: '/api/chat/sessions/{id}',
    method: 'get',
    pathParams: { id: sessionId },
    query: { limit: 50 },
  });

  return ensureContract(data, isGetSessionResponseDTO, 'get-session');
};

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

export const reportMessage = async (params: {
  messageId: string;
  reason: ReportReason;
  comment?: string;
}): Promise<ReportMessageResponseDTO> => {
  const data = await openApiRequest({
    path: '/api/chat/messages/{messageId}/report',
    method: 'post',
    pathParams: { messageId: params.messageId },
    json: {
      reason: params.reason,
      comment: params.comment,
    },
  });

  return ensureContract(data, isReportMessageResponseDTO, 'report-message');
};

export const setMessageFeedback = async (
  messageId: string,
  value: 'positive' | 'negative',
): Promise<{ messageId: string; status: string }> => {
  const data = await openApiRequest({
    path: '/api/chat/messages/{messageId}/feedback',
    method: 'post',
    pathParams: { messageId },
    json: { value },
  });

  return data as { messageId: string; status: string };
};

export interface SetSessionContextResult {
  readonly sessionId: string;
  readonly currentArtworkId: string | null;
  readonly currentRoom: string | null;
}

export const setSessionContext = async (params: {
  sessionId: string;
  currentArtworkId?: string | null;
  currentRoom?: string | null;
}): Promise<SetSessionContextResult> => {
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
    json: body,
  });
  return data as SetSessionContextResult;
};
