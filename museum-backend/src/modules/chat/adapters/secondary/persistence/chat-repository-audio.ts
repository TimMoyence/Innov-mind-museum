import type { ChatMessage } from '@modules/chat/domain/message/chatMessage.entity';
import type { Repository } from 'typeorm';

/** Persists a TTS audio reference for a message (assistant only). */
export async function updateMessageAudio(
  messageRepo: Repository<ChatMessage>,
  messageId: string,
  input: { audioUrl: string; audioGeneratedAt: Date; audioVoice: string },
): Promise<void> {
  await messageRepo.update(
    { id: messageId },
    {
      audioUrl: input.audioUrl,
      audioGeneratedAt: input.audioGeneratedAt,
      audioVoice: input.audioVoice,
    },
  );
}

/** Clears the cached TTS audio reference for a message. */
export async function clearMessageAudio(
  messageRepo: Repository<ChatMessage>,
  messageId: string,
): Promise<void> {
  await messageRepo.update(
    { id: messageId },
    { audioUrl: null, audioGeneratedAt: null, audioVoice: null },
  );
}

/**
 * Returns every non-null `imageRef` tied to messages whose session belongs to the user.
 *
 * Used by the GDPR right-to-erasure cleanup to reach keys that predate the
 * user-scoped S3 path format (`chat-images/user-<id>/YYYY/MM/<uuid>.ext`).
 * MUST be invoked BEFORE the user row is deleted (CASCADE wipes messages/sessions).
 */
export async function findLegacyImageRefsByUserId(
  messageRepo: Repository<ChatMessage>,
  userId: number,
): Promise<string[]> {
  const rows = await messageRepo
    .createQueryBuilder('message')
    .select('message.imageRef', 'imageRef')
    .innerJoin('message.session', 'session')
    .where('session.userId = :userId', { userId })
    .andWhere('message.imageRef IS NOT NULL')
    .getRawMany<{ imageRef: string | null }>();

  const refs = rows
    .map((row) => row.imageRef)
    .filter((ref): ref is string => typeof ref === 'string' && ref.length > 0);

  return Array.from(new Set(refs));
}
