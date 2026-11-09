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

export async function deleteMessageFeedback(
  feedbackRepo: Repository<MessageFeedback>,
  messageId: string,
  userId: number,
): Promise<void> {
  await feedbackRepo.delete({ messageId, userId });
}

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
