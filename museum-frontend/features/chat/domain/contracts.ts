import type { components } from '@/shared/api/generated/openapi';

/** Request payload for creating a new chat session. */
export interface CreateSessionRequestDTO {
  userId?: number;
  locale?: string;
  museumMode?: boolean;
  museumId?: number;
}

type Schemas = components['schemas'];

/** Full session data transfer object derived from the OpenAPI schema. */
export type SessionDTO = Schemas['SessionDTO'];

/** Response payload returned after creating a new chat session. */
export type CreateSessionResponseDTO = Schemas['CreateSessionResponse'];

/** Single chat message data transfer object derived from the OpenAPI schema. */
export type ChatMessageDTO = Schemas['ChatMessageDTO'];

/** Response payload returned after posting a message to a chat session. */
export type PostMessageResponseDTO = Schemas['PostMessageResponse'];

/** Response payload for fetching a session with its messages and pagination info. */
export type GetSessionResponseDTO = Schemas['GetSessionResponse'];

/** Response payload returned after deleting a chat session. */
export type DeleteSessionResponseDTO = Schemas['DeleteSessionResponse'];

/** Request parameters for paginated session listing. */
export interface ListSessionsRequestDTO {
  cursor?: string;
  limit?: number;
}

/** Response payload for the paginated session list endpoint. */
export type ListSessionsResponseDTO = Schemas['ListSessionsResponse'];

/** A single session item within the paginated list response. */
export type SessionListItemDTO = ListSessionsResponseDTO['sessions'][number];

/** Allowed reasons for reporting a chat message. */
export type ReportReason = 'offensive' | 'inaccurate' | 'inappropriate' | 'other';

/** Response payload returned after reporting a chat message. */
export type ReportMessageResponseDTO = {
  messageId: string;
  reported: boolean;
};

interface RecordValue {
  [key: string]: unknown;
}

const isRecord = (value: unknown): value is RecordValue => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

/**
 * Runtime type guard for {@link CreateSessionResponseDTO}.
 * @param payload - Unknown value to validate.
 * @returns `true` if the payload matches the create-session response shape.
 */
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

/**
 * Runtime type guard for {@link PostMessageResponseDTO}.
 * @param payload - Unknown value to validate.
 * @returns `true` if the payload matches the post-message response shape.
 */
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

/**
 * Runtime type guard for {@link GetSessionResponseDTO}.
 * @param payload - Unknown value to validate.
 * @returns `true` if the payload matches the get-session response shape.
 */
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

/**
 * Runtime type guard for {@link DeleteSessionResponseDTO}.
 * @param payload - Unknown value to validate.
 * @returns `true` if the payload matches the delete-session response shape.
 */
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

/**
 * Runtime type guard for {@link ReportMessageResponseDTO}.
 * @param payload - Unknown value to validate.
 * @returns `true` if the payload matches the report-message response shape.
 */
export const isReportMessageResponseDTO = (
  payload: unknown,
): payload is ReportMessageResponseDTO => {
  if (!isRecord(payload)) {
    return false;
  }

  return (
    typeof payload.messageId === 'string' &&
    typeof payload.reported === 'boolean'
  );
};

/**
 * Runtime type guard for {@link ListSessionsResponseDTO}.
 * @param payload - Unknown value to validate.
 * @returns `true` if the payload matches the list-sessions response shape.
 */
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
