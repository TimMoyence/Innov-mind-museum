/**
 * Session ownership validation helpers. Single source of truth for the UUID + fetch + ownership
 * pattern used across ChatService methods.
 *
 * @module chat/useCase/session-access
 */

import { validate as isUuid } from 'uuid';

import { badRequest, notFound } from '@shared/errors/app.error';

import type { ChatRepository } from '../domain/chat.repository.interface';
import type { ChatSession } from '../domain/chatSession.entity';

/**
 * Asserts that the given owner ID matches the current authenticated user.
 * Uses strict null check (`!= null`) to prevent bypass with null/0 values (SEC-16).
 *
 * @param ownerId - The session owner's user ID (may be null/undefined for anonymous sessions).
 * @param currentUserId - The authenticated user's ID (may be undefined).
 * @throws {AppError} 404 if ownership check fails.
 */
export const ensureSessionOwnership = (
  ownerId: number | null | undefined,
  currentUserId: number | undefined,
): void => {
  if (ownerId != null && currentUserId != null && ownerId !== currentUserId) {
    throw notFound('Chat session not found');
  }
};

/**
 * Validates the session ID format, fetches the session, and checks ownership in one call.
 * Replaces the 4-5 line pattern duplicated across ChatService methods.
 *
 * @param sessionId - UUID of the target chat session.
 * @param repository - Chat repository for session lookup.
 * @param currentUserId - Authenticated user ID for ownership verification.
 * @returns The validated chat session.
 * @throws {AppError} 400 if sessionId is not a valid UUID, 404 if session not found or not owned.
 */
export const ensureSessionAccess = async (
  sessionId: string,
  repository: ChatRepository,
  currentUserId?: number,
): Promise<ChatSession> => {
  if (!isUuid(sessionId)) {
    throw badRequest('Invalid session id format');
  }

  const session = await repository.getSessionById(sessionId);
  if (!session) {
    throw notFound('Chat session not found');
  }

  ensureSessionOwnership(session.user?.id, currentUserId);
  return session;
};

/**
 * Validates message ID, fetches the message with its session, and checks ownership.
 * Used by getMessageImageRef and reportMessage.
 *
 * @param messageId - UUID of the target message.
 * @param repository - Chat repository for message lookup.
 * @param currentUserId - Authenticated user ID for ownership verification.
 * @returns The message and its session data.
 * @throws {AppError} 400 if messageId is not a valid UUID, 404 if message not found or not owned.
 */
export const ensureMessageAccess = async (
  messageId: string,
  repository: ChatRepository,
  currentUserId?: number,
): Promise<NonNullable<Awaited<ReturnType<ChatRepository['getMessageById']>>>> => {
  if (!isUuid(messageId)) {
    throw badRequest('Invalid message id format');
  }

  const row = await repository.getMessageById(messageId);
  if (!row) {
    throw notFound('Chat message not found');
  }

  ensureSessionOwnership(row.session.user?.id, currentUserId);
  return row;
};
