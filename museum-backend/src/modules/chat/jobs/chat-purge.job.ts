import { ChatMessage } from '@modules/chat/domain/message/chatMessage.entity';
import { ChatSession } from '@modules/chat/domain/session/chatSession.entity';
import { errorMessage } from '@shared/errors/error-message';
import { logger } from '@shared/logger/logger';

import { noopMediaPurger } from './chat-media-purger';

import type { ChatMediaPurger } from './chat-media-purger';
import type { DataSource } from 'typeorm';

export const DEFAULT_CHAT_PURGE_RETENTION_DAYS = 180;

export const DEFAULT_CHAT_PURGE_BATCH_SIZE = 100;

export interface RunChatPurgeOptions {
  retentionDays?: number;
  batchSize?: number;
  mediaPurger?: ChatMediaPurger;
}

export interface ChatPurgeResult {
  purgedSessions: number;
  purgedMessages: number;
  purgedMedia: number;
  failedMedia: number;
  skippedMedia: number;
}

interface CandidateRow {
  id: string;
}

interface MediaRow {
  imageRef: string | null;
  audioUrl: string | null;
}

async function collectMediaRefs(dataSource: DataSource, sessionId: string): Promise<string[]> {
  const rows = await dataSource
    .getRepository(ChatMessage)
    .createQueryBuilder('msg')
    .select(['msg.imageRef AS "imageRef"', 'msg.audioUrl AS "audioUrl"'])
    .where('msg.sessionId = :id', { id: sessionId })
    .andWhere('(msg.imageRef IS NOT NULL OR msg.audioUrl IS NOT NULL)')
    .getRawMany<MediaRow>();

  const refs: string[] = [];
  for (const row of rows) {
    if (typeof row.imageRef === 'string' && row.imageRef.length > 0) refs.push(row.imageRef);
    if (typeof row.audioUrl === 'string' && row.audioUrl.length > 0) refs.push(row.audioUrl);
  }
  return refs;
}

async function purgeSessionMedia(
  sessionId: string,
  refs: string[],
  mediaPurger: ChatMediaPurger,
): Promise<{ deleted: number; failed: number; skipped: number }> {
  if (refs.length === 0) return { deleted: 0, failed: 0, skipped: 0 };
  try {
    const result = await mediaPurger.deleteRefs(refs);
    if (result.failed.length > 0) {
      logger.warn('chat_purge_media_partial_failure', {
        sessionId,
        failed: result.failed.length,
        firstReason: result.failed[0]?.reason,
      });
    }
    return {
      deleted: result.deleted.length,
      failed: result.failed.length,
      skipped: result.skipped.length,
    };
  } catch (err) {
    logger.error('chat_purge_media_purger_threw', {
      sessionId,
      refsCount: refs.length,
      error: errorMessage(err),
    });
    return { deleted: 0, failed: refs.length, skipped: 0 };
  }
}

async function purgeSessionRows(
  dataSource: DataSource,
  sessionId: string,
): Promise<{ messages: number }> {
  let messages = 0;
  await dataSource.transaction(async (manager) => {
    const deleteResult = await manager
      .getRepository(ChatMessage)
      .createQueryBuilder()
      .delete()
      .where('sessionId = :id', { id: sessionId })
      .execute();

    messages = deleteResult.affected ?? 0;

    await manager
      .getRepository(ChatSession)
      .createQueryBuilder()
      .update()
      .set({ purgedAt: () => 'NOW()' })
      .where('id = :id', { id: sessionId })
      .execute();
  });
  return { messages };
}

export async function runChatPurge(
  dataSource: DataSource,
  opts: RunChatPurgeOptions = {},
): Promise<ChatPurgeResult> {
  const retentionDays = opts.retentionDays ?? DEFAULT_CHAT_PURGE_RETENTION_DAYS;
  const batchSize = opts.batchSize ?? DEFAULT_CHAT_PURGE_BATCH_SIZE;
  const mediaPurger = opts.mediaPurger ?? noopMediaPurger;

  const sessionRepo = dataSource.getRepository(ChatSession);

  const candidates = await sessionRepo
    .createQueryBuilder('session')
    .select('session.id', 'id')
    .where('session.purgedAt IS NULL')
    .andWhere(`session.updatedAt < NOW() - INTERVAL '${String(retentionDays)} days'`)
    .limit(batchSize)
    .getRawMany<CandidateRow>();

  let purgedSessions = 0;
  let purgedMessages = 0;
  let purgedMedia = 0;
  let failedMedia = 0;
  let skippedMedia = 0;

  for (const { id } of candidates) {
    try {
      const refs = await collectMediaRefs(dataSource, id);
      const mediaCounts = await purgeSessionMedia(id, refs, mediaPurger);
      purgedMedia += mediaCounts.deleted;
      failedMedia += mediaCounts.failed;
      skippedMedia += mediaCounts.skipped;

      const dbCounts = await purgeSessionRows(dataSource, id);
      purgedSessions += 1;
      purgedMessages += dbCounts.messages;
    } catch (err) {
      logger.warn('chat_purge_session_failed', {
        sessionId: id,
        error: errorMessage(err),
      });
    }
  }

  logger.info('chat_purge_completed', {
    retentionDays,
    batchSize,
    purgedSessions,
    purgedMessages,
    purgedMedia,
    failedMedia,
    skippedMedia,
  });

  return { purgedSessions, purgedMessages, purgedMedia, failedMedia, skippedMedia };
}
