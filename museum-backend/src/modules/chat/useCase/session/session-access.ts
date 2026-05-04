/**
 * Session ownership validation helpers. Single source of truth for the UUID + fetch + ownership
 * pattern used across ChatService methods.
 *
 * @module chat/useCase/session-access
 */

import { validate as isUuid } from 'uuid';

import { badRequest, notFound } from '@shared/errors/app.error';

import type { ChatRepository } from '@modules/chat/domain/session/chat.repository.interface';
import type { ChatSession } from '@modules/chat/domain/session/chatSession.entity';

/**
 * Asserts that the given owner ID is consistent with the current request identity.
 *
 * Security model (SEC-19, hardened 2026-04-08 — orphan adoption fix):
 *
 *  Authenticated request (`currentUserId != null`):
 *    - The session MUST have a non-null ownerId equal to currentUserId.
 *    - Rejects "orphan adoption" — auth users cannot read sessions whose owner was
 *      deleted (FK SET NULL after account deletion). A deleted user's chat history
 *      is GDPR-protected. Admin moderation must use a dedicated bypass path, not
 *      this helper.
 *    - The strict `!= null` comparison still guards SEC-16 (treat `0` as a real id).
 *
 *  Anonymous request (`currentUserId == null`):
 *    - The session MUST also be anonymous (ownerId == null). An unauthenticated
 *      caller cannot reach an owned session — this prevents the symmetric bypass
 *      where a route that drops `isAuthenticated` would silently allow reads of
 *      any session.
 *    - The all-null case remains supported for the legitimate service-level
 *      anonymous chat flow (no route currently exposes it, but the contract is
 *      preserved for future demo/guest endpoints).
 *
 * @param ownerId - The session owner's user ID (null when orphaned or anonymous).
 * @param currentUserId - The authenticated user's ID (undefined for anonymous calls).
 * @throws {AppError} 404 on orphan adoption, owner mismatch, or anonymous→owned access.
 */
export const ensureSessionOwnership = (
  ownerId: number | null | undefined,
  currentUserId: number | undefined,
): void => {
  if (currentUserId != null) {
    // Authenticated: must own a real (non-orphaned) session.
    if (ownerId == null || ownerId !== currentUserId) {
      throw notFound('Chat session not found');
    }
    return;
  }
  // Anonymous request: only anonymous sessions are accessible.
  if (ownerId != null) {
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
