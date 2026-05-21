import { MessageFeedback } from '@modules/chat/domain/message/messageFeedback.entity';

import type { FeedbackValue } from '@modules/chat/domain/message/messageFeedback.entity';
import type { MessageReport } from '@modules/chat/domain/message/messageReport.entity';
import type {
  MessageFeedbackExportRow,
  MessageReportExportRow,
} from '@modules/chat/domain/session/chat.repository.interface';
import type { Repository } from 'typeorm';

export async function upsertMessageFeedback(
  feedbackRepo: Repository<MessageFeedback>,
  messageId: string,
  userId: number,
  value: FeedbackValue,
): Promise<void> {
  await feedbackRepo
    .createQueryBuilder()
    .insert()
    .into(MessageFeedback)
    .values({ messageId, userId, value })
    .orUpdate(['value'], ['messageId', 'userId'])
    .execute();
}

/**
 * Uses explicit `messageId` FK column (not `message` relation) — relation form
 * `{ message: { id } }` triggers faulty `distinctAlias.MessageFeedback_id`
 * projection on some TypeORM versions with `select`/`distinct`. See Phase 10 findings.
 */
export async function deleteMessageFeedback(
  feedbackRepo: Repository<MessageFeedback>,
  messageId: string,
  userId: number,
): Promise<void> {
  await feedbackRepo.delete({ messageId, userId });
}

/**
 * Uses explicit `messageId` FK column — relation `where` + `select` projection on parent
 * triggers `SELECT distinctAlias.MessageFeedback_id FROM ... distinctAlias` (column
 * never in CTE, breaks query in prod). Phase 10 findings — chat-media.service.ts:178.
 */
export async function getMessageFeedback(
  feedbackRepo: Repository<MessageFeedback>,
  messageId: string,
  userId: number,
): Promise<{ value: FeedbackValue } | null> {
  const row = await feedbackRepo.findOne({
    where: { messageId, userId },
    select: ['value'],
  });

  if (!row) return null;
  return { value: row.value };
}

/**
 * DSAR (Art.15/20, B3 / T1.10) — the user's message feedback projected to the
 * subject-facing export DTO `{ messageId, value, createdAt }`.
 */
export async function listMessageFeedbackForUser(
  feedbackRepo: Repository<MessageFeedback>,
  userId: number,
): Promise<MessageFeedbackExportRow[]> {
  const rows = await feedbackRepo.find({ where: { userId } });
  return rows.map((row) => ({
    messageId: row.messageId,
    value: row.value,
    createdAt: row.createdAt,
  }));
}

/**
 * DSAR (Art.15/20, B3 / T1.10, design D7) — the user's message reports projected
 * to `{ messageId, reason, comment, status, createdAt }`. Third-party moderator
 * fields (`reviewedBy` / `reviewerNotes` / `reviewedAt`) are intentionally
 * excluded — they are staff data about the report, not the subject's own data.
 */
export async function listMessageReportsForUser(
  reportRepo: Repository<MessageReport>,
  userId: number,
): Promise<MessageReportExportRow[]> {
  const rows = await reportRepo.find({ where: { userId } });
  return rows.map((row) => ({
    messageId: row.messageId,
    reason: row.reason,
    comment: row.comment ?? null,
    status: row.status,
    createdAt: row.createdAt,
  }));
}
