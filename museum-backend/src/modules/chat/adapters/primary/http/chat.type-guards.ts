import type {
  CreateSessionResponse,
  DeleteSessionResponse,
  FeedbackMessageResponse,
  GetSessionResponse,
  ListSessionsResponse,
  PostAudioMessageResponse,
  PostMessageResponse,
  ReportMessageResponse,
} from './chat.contracts';

type RecordValue = Record<string, unknown>;

const isRecord = (value: unknown): value is RecordValue =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

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

  const withTranscription = payload as PostMessageResponse & { transcription?: unknown };
  if (!isRecord(withTranscription.transcription)) {
    return false;
  }

  const t = withTranscription.transcription;
  return typeof t.text === 'string' && typeof t.model === 'string' && t.provider === 'openai';
};

const isValidSessionInfo = (session: unknown): boolean =>
  isRecord(session) &&
  typeof session.id === 'string' &&
  typeof session.museumMode === 'boolean' &&
  typeof session.createdAt === 'string' &&
  typeof session.updatedAt === 'string';

const isValidPageInfo = (page: unknown): boolean =>
  isRecord(page) &&
  (page.nextCursor === null || typeof page.nextCursor === 'string') &&
  typeof page.hasMore === 'boolean' &&
  typeof page.limit === 'number';

const isValidMessageItem = (item: unknown): boolean => {
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
};

/** Type guard verifying a payload conforms to {@link GetSessionResponse}. */
export const isGetSessionResponse = (payload: unknown): payload is GetSessionResponse => {
  if (!isRecord(payload) || !Array.isArray(payload.messages) || !isRecord(payload.page)) {
    return false;
  }
  return (
    isValidSessionInfo(payload.session) &&
    isValidPageInfo(payload.page) &&
    payload.messages.every(isValidMessageItem)
  );
};

/** Type guard verifying a payload conforms to {@link DeleteSessionResponse}. */
export const isDeleteSessionResponse = (payload: unknown): payload is DeleteSessionResponse => {
  if (!isRecord(payload)) {
    return false;
  }

  return typeof payload.sessionId === 'string' && typeof payload.deleted === 'boolean';
};

/** Type guard verifying a payload conforms to {@link FeedbackMessageResponse}. */
export const isFeedbackMessageResponse = (payload: unknown): payload is FeedbackMessageResponse => {
  if (!isRecord(payload)) {
    return false;
  }

  return (
    typeof payload.messageId === 'string' &&
    typeof payload.status === 'string' &&
    ['created', 'updated', 'removed'].includes(payload.status)
  );
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
