import type { ChatMessage } from '@modules/chat/domain/message/chatMessage.entity';
import type { Repository } from 'typeorm';

/** Assistant messages only. */
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
 * GDPR right-to-erasure: reaches keys predating user-scoped S3 path format
 * (`chat-images/user-<id>/YYYY/MM/<uuid>.ext`). MUST run BEFORE user row delete
 * (CASCADE wipes messages/sessions).
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

/**
 * GDPR right-to-erasure (B1, R1/R2): resolves the user's stored TTS audio refs
 * from the DB so the account-deletion flow can delete each S3 object via
 * `AudioStorage.deleteByRef` BEFORE the cascade wipes the rows. Mirrors
 * {@link findLegacyImageRefsByUserId} but selects `message.audioUrl`. Audio keys
 * (`chat-audios/YYYY/MM/<uuid>`) carry no user segment, so a prefix scan is
 * impossible — the DB ref set is the only reliable source.
 */
export async function findAudioRefsByUserId(
  messageRepo: Repository<ChatMessage>,
  userId: number,
): Promise<string[]> {
  const rows = await messageRepo
    .createQueryBuilder('message')
    .select('message.audioUrl', 'audioUrl')
    .innerJoin('message.session', 'session')
    .where('session.userId = :userId', { userId })
    .andWhere('message.audioUrl IS NOT NULL')
    .getRawMany<{ audioUrl: string | null }>();

  const refs = rows
    .map((row) => row.audioUrl)
    .filter((ref): ref is string => typeof ref === 'string' && ref.length > 0);

  return Array.from(new Set(refs));
}
