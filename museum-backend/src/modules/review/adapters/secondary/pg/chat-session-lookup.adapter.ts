import { ChatSession } from '@modules/chat/domain/session/chatSession.entity';

import type { IReviewSessionLookup } from '@modules/review/domain/ports/review-session-lookup.port';
import type { DataSource, Repository } from 'typeorm';

/**
 * NPS attribution adapter (C2 / R3-R4 / Q1). Reads `chat_sessions` to resolve
 * the museum a review should be attributed to, filtering by BOTH `id` AND the
 * owning `userId` in one query so a foreign session is indistinguishable from a
 * missing one (no existence oracle — the use-case treats `null` uniformly as
 * "no attribution", persisting `museum_id = NULL`).
 *
 * The session's user FK column is `userId` (camelCase, integer — cf.
 * `chatSession.entity.ts` ManyToOne → users, migration InitDatabase).
 */
export class ChatSessionLookupAdapter implements IReviewSessionLookup {
  private readonly repo: Repository<ChatSession>;

  constructor(dataSource: DataSource) {
    this.repo = dataSource.getRepository(ChatSession);
  }

  async findSessionMuseum(
    sessionId: string,
    userId: number,
  ): Promise<{ museumId: number | null } | null> {
    const row = await this.repo
      .createQueryBuilder('s')
      .select('s.museumId', 'museumId')
      .where('s.id = :sessionId', { sessionId })
      .andWhere('s.userId = :userId', { userId })
      // node-postgres may surface an integer column as a string in raw mode,
      // so the column is typed `number | string | null` to reflect reality.
      .getRawOne<{ museumId: number | string | null }>();

    if (!row) return null;

    const raw = row.museumId;
    if (raw === null) return { museumId: null };
    const museumId = typeof raw === 'string' ? Number.parseInt(raw, 10) : raw;

    return { museumId };
  }
}
