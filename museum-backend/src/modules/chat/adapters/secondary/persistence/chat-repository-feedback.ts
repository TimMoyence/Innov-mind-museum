import { MessageFeedback } from '@modules/chat/domain/message/messageFeedback.entity';

import type { FeedbackValue } from '@modules/chat/domain/message/messageFeedback.entity';
import type { Repository } from 'typeorm';

/**
 * Inserts or updates a feedback entry for a message/user pair.
 *
 * @param feedbackRepo - TypeORM repository for MessageFeedback.
 * @param messageId - UUID of the message.
 * @param userId - Numeric user ID.
 * @param value - Feedback value ('positive' or 'negative').
 */
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
 * Deletes a feedback entry for a message/user pair.
 *
 * Uses the explicit `messageId` FK column (not the `message` relation) so
 * TypeORM emits a flat `WHERE message_id = $1 AND user_id = $2` DELETE.
 * The relation form `{ message: { id } }` triggers a faulty
 * `distinctAlias.MessageFeedback_id` projection on certain TypeORM
 * versions when combined with `select`/`distinct` paths — see Phase 10
 * findings doc.
 */
export async function deleteMessageFeedback(
  feedbackRepo: Repository<MessageFeedback>,
  messageId: string,
  userId: number,
): Promise<void> {
  await feedbackRepo.delete({ messageId, userId });
}

/**
 * Retrieves the current feedback for a message by a user.
 *
 * Uses the explicit `messageId` FK column. Combining a relation `where`
 * with a `select` projection on the parent entity makes TypeORM emit
 * `SELECT distinctAlias.MessageFeedback_id FROM ... distinctAlias` —
 * a column that never appears in the CTE, breaking the query in
 * production (Phase 10 findings — chat-media.service.ts:178 caller).
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
