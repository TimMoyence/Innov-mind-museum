import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { buildGuardrailCitation } from '@modules/chat/useCase/guardrail/art-topic-guardrail';

import type { ChatAssistantMetadata } from '@modules/chat/domain/chat.types';

const imageExtensionByMimeType: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const localImageRefPattern = /^local:\/\/([a-zA-Z0-9._-]+)$/;

export const toLocalImageFileName = (imageRef: string): string | null => {
  const match = localImageRefPattern.exec(imageRef);
  return match?.[1] ?? null;
};

export const sanitizeObjectKeySegment = (value: string): string => {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
};

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
      ? `user-${String(params.userId)}`
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
