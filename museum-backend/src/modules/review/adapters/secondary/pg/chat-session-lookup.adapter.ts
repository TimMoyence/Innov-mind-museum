import { ChatSession } from '@modules/chat/domain/session/chatSession.entity';

import type { IReviewSessionLookup } from '@modules/review/domain/ports/review-session-lookup.port';
import type { DataSource, Repository } from 'typeorm';

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
      .getRawOne<{ museumId: number | string | null }>();

    if (!row) return null;

    const raw = row.museumId;
    if (raw === null) return { museumId: null };
    const museumId = typeof raw === 'string' ? Number.parseInt(raw, 10) : raw;

    return { museumId };
  }
}
