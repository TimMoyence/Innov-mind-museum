export interface CreateSessionRequestDTO {
  userId?: number;
  locale?: string;
  museumMode?: boolean;
}

export interface SessionDTO {
  id: string;
  locale?: string | null;
  museumMode: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSessionResponseDTO {
  session: SessionDTO;
}

export interface ChatMessageDTO {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text?: string | null;
  imageRef?: string | null;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
}

export interface PostMessageResponseDTO {
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
    };
    citations?: string[];
  };
}

export interface GetSessionResponseDTO {
  session: SessionDTO;
  messages: ChatMessageDTO[];
  page: {
    nextCursor: string | null;
    hasMore: boolean;
    limit: number;
  };
}

export interface ListSessionsRequestDTO {
  cursor?: string;
  limit?: number;
}

export interface SessionListItemDTO {
  id: string;
  locale?: string | null;
  museumMode: boolean;
  createdAt: string;
  updatedAt: string;
  preview?: {
    text: string;
    createdAt: string;
    role: 'user' | 'assistant' | 'system';
  };
  messageCount: number;
}

export interface ListSessionsResponseDTO {
  sessions: SessionListItemDTO[];
  page: {
    nextCursor: string | null;
    hasMore: boolean;
    limit: number;
  };
}

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

    return (
      typeof item.id === 'string' &&
      typeof item.createdAt === 'string' &&
      ['user', 'assistant', 'system'].includes(String(item.role))
    );
  });
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
