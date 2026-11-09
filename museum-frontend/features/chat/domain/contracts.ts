import type { components } from '@/shared/api/generated/openapi';

export interface CreateSessionRequestDTO {
  userId?: number;
  locale?: string;
  museumMode?: boolean;
  museumId?: number;
  museumName?: string;
  museumAddress?: string;
  coordinates?: { lat: number; lng: number };
  intent?: 'default' | 'walk';
}

type Schemas = components['schemas'];

export type SessionDTO = Schemas['SessionDTO'];

export type CreateSessionResponseDTO = Schemas['CreateSessionResponse'];

export type ChatMessageDTO = Schemas['ChatMessageDTO'];

export type PostMessageResponseDTO = Schemas['PostMessageResponse'];

export type GetSessionResponseDTO = Schemas['GetSessionResponse'];

export type DeleteSessionResponseDTO = Schemas['DeleteSessionResponse'];

export interface ListSessionsRequestDTO {
  cursor?: string;
  limit?: number;
}

export type ListSessionsResponseDTO = Schemas['ListSessionsResponse'];

export type SessionListItemDTO = ListSessionsResponseDTO['sessions'][number];

export type ReportReason = 'offensive' | 'inaccurate' | 'inappropriate' | 'other';

export interface ReportMessageResponseDTO {
  messageId: string;
  reported: boolean;
}

type RecordValue = Record<string, unknown>;

const isRecord = (value: unknown): value is RecordValue => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

type FieldType = 'string' | 'boolean' | 'number';

const hasFields = (value: unknown, fields: Record<string, FieldType>): value is RecordValue =>
  isRecord(value) && Object.entries(fields).every(([key, type]) => typeof value[key] === type);

const SESSION_FIELDS: Record<string, FieldType> = {
  id: 'string',
  museumMode: 'boolean',
  createdAt: 'string',
  updatedAt: 'string',
};

export const isCreateSessionResponseDTO = (payload: unknown): payload is CreateSessionResponseDTO =>
  isRecord(payload) && hasFields(payload.session, SESSION_FIELDS);

export const isPostMessageResponseDTO = (payload: unknown): payload is PostMessageResponseDTO => {
  if (!isRecord(payload) || !isRecord(payload.message) || !isRecord(payload.metadata)) {
    return false;
  }

  if (payload.transcription !== undefined) {
    if (!isRecord(payload.transcription)) {
      return false;
    }
    if (
      typeof payload.transcription.text !== 'string' ||
      typeof payload.transcription.model !== 'string' ||
      payload.transcription.provider !== 'openai'
    ) {
      return false;
    }
  }

  return (
    typeof payload.sessionId === 'string' &&
    payload.message.role === 'assistant' &&
    typeof payload.message.id === 'string' &&
    typeof payload.message.text === 'string' &&
    typeof payload.message.createdAt === 'string'
  );
};

export const isGetSessionResponseDTO = (payload: unknown): payload is GetSessionResponseDTO => {
  if (
    !isRecord(payload) ||
    !hasFields(payload.session, SESSION_FIELDS) ||
    !Array.isArray(payload.messages) ||
    !hasFields(payload.page, { hasMore: 'boolean', limit: 'number' }) ||
    !(payload.page.nextCursor === null || typeof payload.page.nextCursor === 'string')
  ) {
    return false;
  }

  return payload.messages.every(
    (item) =>
      hasFields(item, { id: 'string', createdAt: 'string' }) &&
      ['user', 'assistant', 'system'].includes(String(item.role)) &&
      (item.image === undefined ||
        item.image === null ||
        hasFields(item.image, { url: 'string', expiresAt: 'string' })),
  );
};

export const isDeleteSessionResponseDTO = (payload: unknown): payload is DeleteSessionResponseDTO =>
  hasFields(payload, { sessionId: 'string', deleted: 'boolean' });

export const isReportMessageResponseDTO = (payload: unknown): payload is ReportMessageResponseDTO =>
  hasFields(payload, { messageId: 'string', reported: 'boolean' });

export const isListSessionsResponseDTO = (payload: unknown): payload is ListSessionsResponseDTO => {
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

  return payload.sessions.every((session) => {
    if (!isRecord(session)) {
      return false;
    }

    if (
      typeof session.id !== 'string' ||
      typeof session.museumMode !== 'boolean' ||
      typeof session.createdAt !== 'string' ||
      typeof session.updatedAt !== 'string' ||
      typeof session.messageCount !== 'number'
    ) {
      return false;
    }

    if (
      session.museumId !== undefined &&
      session.museumId !== null &&
      typeof session.museumId !== 'number'
    ) {
      return false;
    }
    if (
      session.lastArtworkTitle !== undefined &&
      session.lastArtworkTitle !== null &&
      typeof session.lastArtworkTitle !== 'string'
    ) {
      return false;
    }

    if (session.preview !== undefined) {
      if (!isRecord(session.preview)) {
        return false;
      }

      if (
        typeof session.preview.text !== 'string' ||
        typeof session.preview.createdAt !== 'string' ||
        !['user', 'assistant', 'system'].includes(String(session.preview.role))
      ) {
        return false;
      }
    }

    return true;
  });
};
