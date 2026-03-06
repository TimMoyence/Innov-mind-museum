import type { components } from '@/shared/api/generated/openapi';

export interface CreateSessionRequestDTO {
  userId?: number;
  locale?: string;
  museumMode?: boolean;
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

interface RecordValue {
  [key: string]: unknown;
}

const isRecord = (value: unknown): value is RecordValue => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

export const isCreateSessionResponseDTO = (
  payload: unknown,
): payload is CreateSessionResponseDTO => {
  if (!isRecord(payload) || !isRecord(payload.session)) {
    return false;
  }

  return (
    typeof payload.session.id === 'string' &&
    typeof payload.session.museumMode === 'boolean' &&
    typeof payload.session.createdAt === 'string' &&
    typeof payload.session.updatedAt === 'string'
  );
};

export const isPostMessageResponseDTO = (
  payload: unknown,
): payload is PostMessageResponseDTO => {
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

export const isGetSessionResponseDTO = (
  payload: unknown,
): payload is GetSessionResponseDTO => {
  if (!isRecord(payload) || !isRecord(payload.session) || !Array.isArray(payload.messages) || !isRecord(payload.page)) {
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
    if (!isRecord(item)) {
      return false;
    }

    if (item.image !== undefined && item.image !== null) {
      if (!isRecord(item.image)) {
        return false;
      }
      if (
        typeof item.image.url !== 'string' ||
        typeof item.image.expiresAt !== 'string'
      ) {
        return false;
      }
    }

    return (
      typeof item.id === 'string' &&
      typeof item.createdAt === 'string' &&
      ['user', 'assistant', 'system'].includes(String(item.role))
    );
  });
};

export const isDeleteSessionResponseDTO = (
  payload: unknown,
): payload is DeleteSessionResponseDTO => {
  if (!isRecord(payload)) {
    return false;
  }

  return (
    typeof payload.sessionId === 'string' &&
    typeof payload.deleted === 'boolean'
  );
};

export const isListSessionsResponseDTO = (
  payload: unknown,
): payload is ListSessionsResponseDTO => {
  if (
    !isRecord(payload) ||
    !Array.isArray(payload.sessions) ||
    !isRecord(payload.page)
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
