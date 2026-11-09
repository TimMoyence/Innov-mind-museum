import { ChatMessage } from '@modules/chat/domain/message/chatMessage.entity';
import { ChatSession } from '@modules/chat/domain/session/chatSession.entity';
import type { ChatSessionIntent } from '@modules/chat/domain/chat.types';

export function makeSessionUser(id: number): ChatSession['user'] {
  return { id } as ChatSession['user'];
}

export function makeSession(overrides: Partial<ChatSession> = {}): ChatSession {
  const session = Object.assign(new ChatSession(), {
    id: 'session-001',
    locale: 'en',
    museumMode: false,
    intent: 'default' as ChatSessionIntent,
    title: null,
    museumName: null,
    museumId: null,
    visitContext: null,
    messages: [],
    version: 1,
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    ...overrides,
  });
  return session;
}

export function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  const session = overrides.session ?? makeSession();
  const message = Object.assign(new ChatMessage(), {
    id: 'msg-001',
    session,
    sessionId: session.id,
    role: 'user' as const,
    text: 'Hello',
    imageRef: null,
    metadata: null,
    artworkMatches: [],
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    ...overrides,
  });
  return message;
}
