import { wikimediaHttps } from '@shared/media/wikimedia-https';
import { isRecord } from '@shared/utils/is-record';

import type { ChatMessage } from '@modules/chat/domain/message/chatMessage.entity';
import type { ChatSession } from '@modules/chat/domain/session/chatSession.entity';
import type {
  CreateSessionResult,
  SessionResult,
} from '@modules/chat/useCase/orchestration/chat.service.types';

type SessionMessageView = SessionResult['messages'][number];

function withHttpsRecord(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, withHttpsUrls(value)]),
  );
}

function withHttpsUrls(value: unknown): unknown {
  if (typeof value === 'string') return wikimediaHttps(value);
  if (Array.isArray(value)) return value.map(withHttpsUrls);
  return isRecord(value) ? withHttpsRecord(value) : value;
}

const withHttpsMessageImages = ({
  metadata,
  ...message
}: SessionMessageView): SessionMessageView => ({
  ...message,
  metadata: metadata ? withHttpsRecord(metadata) : metadata,
});

export const withHttpsImages = (result: SessionResult): SessionResult => ({
  ...result,
  messages: result.messages.map(withHttpsMessageImages),
});

export const toPageLimit = (limit: number | undefined): number =>
  Math.max(1, Math.min(limit === undefined || limit === 0 || Number.isNaN(limit) ? 20 : limit, 50));

export const toSessionDTO = (session: ChatSession): CreateSessionResult => ({
  id: session.id,
  locale: session.locale,
  museumMode: session.museumMode,
  title: session.title ?? null,
  museumName: session.museumName ?? null,
  createdAt: session.createdAt.toISOString(),
  updatedAt: session.updatedAt.toISOString(),
  intent: session.intent,
});

export const toSessionMessageView = (message: ChatMessage): SessionMessageView => ({
  id: message.id,
  role: message.role,
  text: message.text,
  imageRef: message.imageRef,
  image: null,
  createdAt: message.createdAt.toISOString(),
  metadata: message.metadata,
});
