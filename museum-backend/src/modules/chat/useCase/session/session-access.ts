import { validate as isUuid } from 'uuid';

import { invalidInput, notFound } from '@shared/errors/app.error';

import type { ChatRepository } from '@modules/chat/domain/session/chat.repository.interface';
import type { ChatSession } from '@modules/chat/domain/session/chatSession.entity';

export const ensureSessionOwnership = (
  ownerId: number | null | undefined,
  currentUserId: number | undefined,
): void => {
  if (currentUserId != null) {
    if (ownerId == null || ownerId !== currentUserId) {
      throw notFound('Chat session not found');
    }
    return;
  }
  if (ownerId != null) {
    throw notFound('Chat session not found');
  }
};

export const ensureSessionAccess = async (
  sessionId: string,
  repository: ChatRepository,
  currentUserId?: number,
): Promise<ChatSession> => {
  if (!isUuid(sessionId)) {
    throw invalidInput('Invalid session id format');
  }

  const session = await repository.getSessionById(sessionId);
  if (!session) {
    throw notFound('Chat session not found');
  }

  ensureSessionOwnership(session.user?.id, currentUserId);
  return session;
};

export const ensureMessageAccess = async (
  messageId: string,
  repository: ChatRepository,
  currentUserId?: number,
): Promise<NonNullable<Awaited<ReturnType<ChatRepository['getMessageById']>>>> => {
  if (!isUuid(messageId)) {
    throw invalidInput('Invalid message id format');
  }

  const row = await repository.getMessageById(messageId);
  if (!row) {
    throw notFound('Chat message not found');
  }

  ensureSessionOwnership(row.session.user?.id, currentUserId);
  return row;
};
