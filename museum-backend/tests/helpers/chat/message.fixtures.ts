import { ChatMessage } from '@modules/chat/domain/chatMessage.entity';
import { ChatSession } from '@modules/chat/domain/chatSession.entity';

/**
 * Creates a minimal ChatSession.user stub for tests that only need `id`.
 * Keeps the inline `as ChatSession['user']` cast out of every call site.
 */
export function makeSessionUser(id: number): ChatSession['user'] {
  return { id } as ChatSession['user'];
}

/**
 * Creates a ChatSession entity with sensible defaults.
 * Override any field via the `overrides` parameter.
 * @param overrides
 */
export function makeSession(overrides: Partial<ChatSession> = {}): ChatSession {
  const session = Object.assign(new ChatSession(), {
    id: 'session-001',
    locale: 'en',
    museumMode: false,
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

/**
 * Creates a ChatMessage entity with sensible defaults.
 * Override any field via the `overrides` parameter.
 *
 * If no `session` is provided, a default session is created via `makeSession()`.
 * @param overrides
 */
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
