import { UserMemory } from '@modules/chat/domain/memory/userMemory.entity';
import { ChatMessage } from '@modules/chat/domain/message/chatMessage.entity';
import { ChatSession } from '@modules/chat/domain/session/chatSession.entity';

import type {
  RecentSessionAggregate,
  UserMemoryRepository,
  UserMemoryUpdates,
} from '@modules/chat/domain/memory/userMemory.repository.interface';
import type { DataSource, Repository } from 'typeorm';

export class TypeOrmUserMemoryRepository implements UserMemoryRepository {
  private readonly repo: Repository<UserMemory>;
  private readonly dataSource: DataSource;

  constructor(dataSource: DataSource) {
    this.dataSource = dataSource;
    this.repo = dataSource.getRepository(UserMemory);
  }

  async getByUserId(userId: number): Promise<UserMemory | null> {
    return await this.repo.findOne({ where: { userId } });
  }

  async upsert(userId: number, updates: UserMemoryUpdates): Promise<UserMemory> {
    const values: Partial<UserMemory> = { userId, ...updates };

    const propertyToColumnName = (propertyName: string): string => {
      const column = this.repo.metadata.findColumnWithPropertyName(propertyName);
      if (!column) {
        throw new Error(
          `UserMemory entity has no column for property "${propertyName}" — check entity definition or update the UserMemoryUpdates type`,
        );
      }
      return column.databaseName;
    };

    await this.repo
      .createQueryBuilder()
      .insert()
      .into(UserMemory)
      .values(values)
      .orUpdate(Object.keys(updates).map(propertyToColumnName), [propertyToColumnName('userId')])
      .execute();

    const row = await this.repo.findOne({ where: { userId } });
    if (!row) {
      throw new Error('User memory row missing after upsert');
    }
    return row;
  }

  async deleteByUserId(userId: number): Promise<void> {
    await this.repo.delete({ userId });
  }

  async getRecentSessionsForUser(userId: number, limit: number): Promise<RecentSessionAggregate[]> {
    const rows = await this.dataSource
      .createQueryBuilder()
      .select('s.id', 'sessionId')
      .addSelect('s.locale', 'locale')
      .addSelect('s.createdAt', 'createdAt')
      .addSelect('MAX(m.createdAt)', 'lastMessageAt')
      .from(ChatSession, 's')
      .leftJoin(ChatMessage, 'm', 'm."sessionId" = s.id')
      .where('s."userId" = :userId', { userId })
      .groupBy('s.id')
      .orderBy('s.createdAt', 'DESC')
      .limit(limit)
      .getRawMany<{
        sessionId: string;
        locale: string;
        createdAt: Date | string;
        lastMessageAt: Date | string | null;
      }>();

    return rows.map((r) => ({
      sessionId: r.sessionId,
      locale: r.locale,
      createdAt: new Date(r.createdAt),
      lastMessageAt: r.lastMessageAt ? new Date(r.lastMessageAt) : null,
    }));
  }
}
