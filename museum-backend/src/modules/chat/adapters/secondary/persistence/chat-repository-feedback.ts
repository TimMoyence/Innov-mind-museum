import { MessageFeedback } from '@modules/chat/domain/message/messageFeedback.entity';

import type { FeedbackValue } from '@modules/chat/domain/message/messageFeedback.entity';
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
