import { ChatMessage } from '@modules/chat/domain/chatMessage.entity';
import { ChatSession } from '@modules/chat/domain/chatSession.entity';
import { logger } from '@shared/logger/logger';

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
}

/** Outcome counters for a single purge run. */
export interface ChatPurgeResult {
  /** Number of sessions whose messages were deleted + flagged in this tick. */
  purgedSessions: number;
  /** Total rows deleted from `chat_messages` across all processed sessions. */
  purgedMessages: number;
}

interface CandidateRow {
  id: string;
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

  for (const { id } of candidates) {
    try {
      await dataSource.transaction(async (manager) => {
        const deleteResult = await manager
          .getRepository(ChatMessage)
          .createQueryBuilder()
          .delete()
          .where('sessionId = :id', { id })
          .execute();

        const deleted = deleteResult.affected ?? 0;

        await manager
          .getRepository(ChatSession)
          .createQueryBuilder()
          .update()
          .set({ purgedAt: () => 'NOW()' })
          .where('id = :id', { id })
          .execute();

        purgedSessions += 1;
        purgedMessages += deleted;
      });
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
  });

  return { purgedSessions, purgedMessages };
}
