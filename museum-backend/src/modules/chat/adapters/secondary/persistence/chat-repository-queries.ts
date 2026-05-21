import { In, type Repository } from 'typeorm';

import { ChatMessage } from '@modules/chat/domain/message/chatMessage.entity';
import { ChatSession } from '@modules/chat/domain/session/chatSession.entity';

import type { ChatRole } from '@modules/chat/domain/chat.types';
import type { UserChatExportData } from '@modules/chat/domain/session/chat.repository.interface';

const MAX_PAGE_SIZE = 50;

const SESSION_ID_COLUMN = 'message.sessionId';

export async function fetchMessageCounts(
  messageRepo: Repository<ChatMessage>,
  sessionIds: string[],
): Promise<Map<string, number>> {
  const messageCounts = await messageRepo
    .createQueryBuilder('message')
    .select(SESSION_ID_COLUMN, 'sessionId')
    .addSelect('COUNT(message.id)', 'messageCount')
    .where('message.sessionId IN (:...sessionIds)', { sessionIds })
    .groupBy(SESSION_ID_COLUMN)
    .getRawMany<{ sessionId: string; messageCount: string }>();

  const countBySessionId = new Map<string, number>();
  for (const row of messageCounts) {
    countBySessionId.set(row.sessionId, Number(row.messageCount) || 0);
  }
  return countBySessionId;
}

/** DISTINCT ON per session, latest by createdAt. */
export async function fetchMessagePreviews(
  messageRepo: Repository<ChatMessage>,
  sessionIds: string[],
): Promise<Map<string, { role: ChatRole; text: string | null; createdAt: Date }>> {
  const previewRows = await messageRepo
    .createQueryBuilder('message')
    .select(SESSION_ID_COLUMN, 'sessionId')
    .addSelect('message.role', 'role')
    .addSelect('message.text', 'text')
    .addSelect('message.createdAt', 'createdAt')
    .where('message.sessionId IN (:...sessionIds)', { sessionIds })
    .distinctOn([SESSION_ID_COLUMN])
    .orderBy(SESSION_ID_COLUMN, 'ASC')
    .addOrderBy('message.createdAt', 'DESC')
    .addOrderBy('message.id', 'DESC')
    .getRawMany<{
      sessionId: string;
      role: ChatRole;
      text: string | null;
      createdAt: Date | string;
    }>();

  const previewBySessionId = new Map<
    string,
    { role: ChatRole; text: string | null; createdAt: Date }
  >();
  for (const row of previewRows) {
    previewBySessionId.set(row.sessionId, {
      role: row.role,
      text: row.text,
      createdAt: row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt),
    });
  }
  return previewBySessionId;
}

/** GDPR data portability. */
export async function exportUserChatData(
  sessionRepo: Repository<ChatSession>,
  userId: number,
): Promise<UserChatExportData> {
  return await sessionRepo.manager.transaction('REPEATABLE READ', async (em) => {
    const sessionEM = em.getRepository(ChatSession);
    const messageEM = em.getRepository(ChatMessage);

    const allSessions: UserChatExportData['sessions'] = [];
    let offset = 0;

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- infinite pagination loop
    while (true) {
      const sessionBatch = await sessionEM.find({
        where: { user: { id: userId } },
        order: { createdAt: 'DESC' },
        take: MAX_PAGE_SIZE,
        skip: offset,
      });

      if (sessionBatch.length === 0) break;

      const sessionIds = sessionBatch.map((s) => s.id);
      const messages = await messageEM.find({
        where: { session: { id: In(sessionIds) } },
        relations: ['session'],
        order: { createdAt: 'ASC' },
      });

      const messagesBySessionId = new Map<string, ChatMessage[]>();
      for (const msg of messages) {
        const sessionId = msg.session.id;
        const list = messagesBySessionId.get(sessionId) ?? [];
        list.push(msg);
        messagesBySessionId.set(sessionId, list);
      }

      for (const session of sessionBatch) {
        const sessionMessages = messagesBySessionId.get(session.id) ?? [];
        allSessions.push({
          id: session.id,
          locale: session.locale,
          museumMode: session.museumMode,
          // B3 (DSAR) — previously-omitted ChatSession columns (R13).
          intent: session.intent,
          museumId: session.museumId ?? null,
          coordinates: session.coordinates ?? null,
          visitContext: session.visitContext ?? null,
          currentRoom: session.currentRoom ?? null,
          currentArtworkId: session.currentArtworkId ?? null,
          title: session.title ?? null,
          museumName: session.museumName ?? null,
          createdAt: session.createdAt.toISOString(),
          updatedAt: session.updatedAt.toISOString(),
          messages: sessionMessages.map((msg) => ({
            id: msg.id,
            role: msg.role,
            text: msg.text,
            imageRef: msg.imageRef,
            audioUrl: msg.audioUrl ?? null,
            createdAt: msg.createdAt.toISOString(),
            metadata: msg.metadata,
          })),
        });
      }

      if (sessionBatch.length < MAX_PAGE_SIZE) break;
      offset += MAX_PAGE_SIZE;
    }

    return { sessions: allSessions };
  });
}
