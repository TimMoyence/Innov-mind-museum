/**
 * Pure helper functions extracted from chat.service.ts for image handling,
 * cursor validation, and policy citations.
 *
 * @module chat/application/chat-image.helpers
 */

import { randomUUID } from 'node:crypto';
import path from 'node:path';

import {
  buildGuardrailCitation,
} from './art-topic-guardrail';

import type { ChatAssistantMetadata } from '../domain/chat.types';

/** Maps image MIME types to file extensions. */
export const imageExtensionByMimeType: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** Regex matching `local://<filename>` image references. */
export const localImageRefPattern = /^local:\/\/([a-zA-Z0-9._-]+)$/;

/**
 * Extracts the local file name from a `local://` image reference.
 *
 * @param imageRef - Storage reference string.
 * @returns The file name portion, or null if not a local reference.
 */
export const toLocalImageFileName = (imageRef: string): string | null => {
  const match = localImageRefPattern.exec(imageRef);
  return match?.[1] ?? null;
};

/**
 * Strips characters that are unsafe in S3 object key segments.
 *
 * @param value - Raw segment string.
 * @returns Sanitized segment with only alphanumerics, dots, underscores, and hyphens.
 */
export const sanitizeObjectKeySegment = (value: string): string => {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
};

/**
 * Builds a structured S3 object key for a chat image upload.
 *
 * @param params - MIME type, session ID, optional user ID and timestamp.
 * @param params.mimeType - Image MIME type for extension resolution.
 * @param params.sessionId - Chat session UUID.
 * @param params.userId - Optional owning user ID.
 * @param params.now - Optional timestamp override.
 * @returns The object key path (e.g. `chat-images/2024/03/user-42/session-abc/uuid.jpg`).
 */
export const buildChatImageObjectKey = (params: {
  mimeType: string;
  sessionId: string;
  userId?: number;
  now?: Date;
}): string => {
  const extension = imageExtensionByMimeType[params.mimeType] ?? 'img';
  const now = params.now ?? new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const userSegment =
    typeof params.userId === 'number' && Number.isInteger(params.userId) && params.userId > 0
      ? `user-${params.userId}`
      : 'user-anonymous';
  const sessionSegment = `session-${sanitizeObjectKeySegment(params.sessionId)}`;

  return [
    'chat-images',
    yyyy,
    mm,
    userSegment,
    sessionSegment,
    `${randomUUID()}.${extension}`,
  ].join('/');
};

/**
 * Appends a policy citation to the assistant metadata if a guardrail reason is provided.
 *
 * @param metadata - Existing assistant metadata.
 * @param reason - Guardrail block reason (optional).
 * @returns Updated metadata with the citation appended (or unchanged if no reason).
 */
export const withPolicyCitation = (
  metadata: ChatAssistantMetadata,
  reason?: Parameters<typeof buildGuardrailCitation>[0],
): ChatAssistantMetadata => {
  const policyCitation = buildGuardrailCitation(reason);
  if (!policyCitation) {
    return metadata;
  }

  const citations = metadata.citations ? [...metadata.citations] : [];
  if (!citations.includes(policyCitation)) {
    citations.push(policyCitation);
  }

  return {
    ...metadata,
    citations,
  };
};

/**
 * Validates a base64url-encoded cursor for session list pagination.
 *
 * @param value - The cursor string to validate.
 * @returns True if the cursor decodes to a valid `{updatedAt, id}` object.
 */
export const isValidSessionListCursor = (value: string): boolean => {
  try {
    const decoded = Buffer.from(value, 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded) as unknown;

    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as Record<string, unknown>).updatedAt === 'string' &&
      typeof (parsed as Record<string, unknown>).id === 'string'
    );
  } catch {
    return false;
  }
};

/**
 * Resolves the content type for a local image file based on its extension.
 *
 * @param imageRef - A `local://` image reference.
 * @returns Object with fileName and optional contentType, or null for non-local refs.
 */
export const resolveLocalImageMeta = (
  imageRef: string,
): { fileName: string; contentType?: string } | null => {
  const fileName = toLocalImageFileName(imageRef);
  if (!fileName) return null;

  const extension = path.extname(fileName).replace('.', '').toLowerCase();
  const contentType = Object.entries(imageExtensionByMimeType).find(
    ([, ext]) => ext === extension,
  )?.[0];

  return { fileName, contentType };
};
