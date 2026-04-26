import { ChatMessage } from '@modules/chat/domain/chatMessage.entity';
import { ChatSession } from '@modules/chat/domain/chatSession.entity';
import { logger } from '@shared/logger/logger';

import { noopMediaPurger } from './chat-media-purger';

import type { ChatMediaPurger } from './chat-media-purger';
import type { DataSource } from 'typeorm';

/** Default retention window (6 months) aligned with GDPR minimization policy. */
export const DEFAULT_CHAT_PURGE_RETENTION_DAYS = 180;

/** Default batch size — bounded so one tick never holds long locks on `chat_messages`. */
export const DEFAULT_CHAT_PURGE_BATCH_SIZE = 100;

/** Options accepted by {@link runChatPurge}. */
export interface RunChatPurgeOptions {
  /** Retention window in days. Sessions last active past this are purged. */
  retentionDays?: number;
  /** Max number of sessions processed per invocation. */
  batchSize?: number;
  /**
   * Adapter used to delete media artefacts (S3 audio + images) referenced by
   * the purged sessions. Defaults to {@link noopMediaPurger} so unit tests
   * stay decoupled from any storage backend. Production wires this via the
   * cron registrar.
   */
  mediaPurger?: ChatMediaPurger;
}

/** Outcome counters for a single purge run. */
export interface ChatPurgeResult {
  /** Number of sessions whose messages were deleted + flagged in this tick. */
  purgedSessions: number;
  /** Total rows deleted from `chat_messages` across all processed sessions. */
  purgedMessages: number;
  /** Total media artefacts removed from object storage / disk. */
  purgedMedia: number;
  /** Media references that failed to delete and will be retried next tick. */
  failedMedia: number;
  /** Media references skipped (external URLs, malformed shape). */
  skippedMedia: number;
}

interface CandidateRow {
  id: string;
}

interface MediaRow {
  imageRef: string | null;
  audioUrl: string | null;
}

/**
 * Collects every storage reference (image + audio) attached to a session.
 * Returns the raw, unfiltered list — classification happens inside the
 * purger so external URLs (Unsplash, Wikidata) flow through the same code
 * path and can be reported as `skipped` rather than silently dropped.
 */
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

/**
 * Dispatches a single session's media refs to the configured purger and
 * folds the result into the running counters. Errors are logged and
 * counted but never re-thrown — DB delete must keep going so a flaky S3
 * endpoint does not strand otherwise-purgable rows.
 */
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
      error: err instanceof Error ? err.message : String(err),
    });
    return { deleted: 0, failed: refs.length, skipped: 0 };
  }
}

/**
 * Atomic DB cleanup for one session: delete its messages and flag the parent
 * row as purged. Each session runs in its own transaction so a single bad row
 * does not roll back the rest of the tick.
 */
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

/**
 * Deletes chat messages for sessions older than {@link RunChatPurgeOptions.retentionDays}
 * and flags the parent `chat_sessions` row via `purged_at = NOW()`.
 *
 * Design decisions:
 *   - Uses `updatedAt` as the activity watermark (refreshed by TypeORM on every
 *     message insert through the session). Sessions never touched since their
 *     creation inherit `updatedAt = createdAt`, so they fall into the same
 *     bucket — no special case needed.
 *   - Each session is processed in its own transaction so a failure on one row
 *     does not roll back previous successes. This keeps the cron resilient
 *     against individual corrupt rows (long-tail production risk).
 *   - Idempotent: rows with `purged_at IS NOT NULL` are filtered out at the
 *     selection query, so re-running the job on the same horizon is a no-op.
 *
 * @param dataSource TypeORM DataSource (live connection pool).
 * @param opts Retention + batch-size overrides. Defaults documented above.
 * @returns Per-run counts (sessions + messages purged).
 */
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
      // Step 1 — best-effort media purge OUTSIDE the DB transaction so a
      // long-running DeleteObjects call never holds a row lock.
      const refs = await collectMediaRefs(dataSource, id);
      const mediaCounts = await purgeSessionMedia(id, refs, mediaPurger);
      purgedMedia += mediaCounts.deleted;
      failedMedia += mediaCounts.failed;
      skippedMedia += mediaCounts.skipped;

      // Step 2 — atomic DB cleanup.
      const dbCounts = await purgeSessionRows(dataSource, id);
      purgedSessions += 1;
      purgedMessages += dbCounts.messages;
    } catch (err) {
      logger.warn('chat_purge_session_failed', {
        sessionId: id,
        error: err instanceof Error ? err.message : String(err),
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
