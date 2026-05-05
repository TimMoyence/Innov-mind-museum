import { UserMemory } from '@modules/chat/domain/memory/userMemory.entity';
import { ChatMessage } from '@modules/chat/domain/message/chatMessage.entity';
import { ChatSession } from '@modules/chat/domain/session/chatSession.entity';

import type {
  RecentSessionAggregate,
  UserMemoryRepository,
  UserMemoryUpdates,
} from '@modules/chat/domain/memory/userMemory.repository.interface';
import type { DataSource, Repository } from 'typeorm';

/** TypeORM/PG implementation of {@link UserMemoryRepository}. */
export class TypeOrmUserMemoryRepository implements UserMemoryRepository {
  private readonly repo: Repository<UserMemory>;
  private readonly dataSource: DataSource;

  constructor(dataSource: DataSource) {
    this.dataSource = dataSource;
    this.repo = dataSource.getRepository(UserMemory);
  }

  /** Retrieves the user memory record for a given user, or null if none exists. */
  async getByUserId(userId: number): Promise<UserMemory | null> {
    return await this.repo.findOne({ where: { userId } });
  }

  /**
   * Atomic UPSERT for the user-memory row.
   *
   * Uses TypeORM's `.insert().orUpdate()` which compiles to a single
   * `INSERT … ON CONFLICT (user_id) DO UPDATE` SQL statement — one
   * round-trip, atomic at the row level. Concurrent callers cannot lose
   * updates because Postgres serialises the conflict resolution per row.
   *
   * The `@VersionColumn` on the entity (see UserMemory entity) is passive
   * on this path: TypeORM's `@VersionColumn` auto-increment is only
   * triggered by the entity manager's `.save()` / `.update()` paths, not
   * by a raw query-builder INSERT. The column therefore does NOT increment
   * on each upsert — it remains a monotonic counter seeded at `1` for
   * `.save()` inserts and unchanged on subsequent `.orUpdate()` calls.
   * If client-side cache invalidation relies on `version` changing, prefer
   * using `updatedAt` (which Postgres does update via `@UpdateDateColumn`)
   * or switch to `.save()` with a transaction guard on this path.
   *
   * To add version incrementing here without switching to `.save()`, add
   * `version` to the `orUpdate` columns list with a raw expression like
   * `user_memories.version + 1`. This is intentionally left as a future
   * decision rather than an undocumented behaviour.
   */
  async upsert(userId: number, updates: UserMemoryUpdates): Promise<UserMemory> {
    // Build column-value maps for the INSERT … ON CONFLICT … DO UPDATE statement.
    // Partial<UserMemory> is the precise QueryDeepPartialEntity-compatible
    // shape TypeORM expects on `.values()` for an upsert path.
    const values: Partial<UserMemory> = { userId, ...updates };

    // Resolve each entity property name to its actual DB column name from
    // TypeORM metadata. The previous implementation used a naive
    // camelCase→snake_case helper which silently broke for columns kept in
    // camelCase by migration `Check1776593907869` (e.g. `sessionCount`,
    // `favoritePeriods`) — those columns retain their property name in PG
    // (double-quoted) and were missing the `name:` override on the entity,
    // so a hand-rolled converter cannot know which casing wins per-field.
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

    // Return the freshly-written row.
    const row = await this.repo.findOne({ where: { userId } });
    if (!row) {
      throw new Error('User memory row missing after upsert');
    }
    return row;
  }

  /** Deletes the user memory record for a given user. */
  async deleteByUserId(userId: number): Promise<void> {
    await this.repo.delete({ userId });
  }

  /**
   * Returns the user's last `limit` sessions, each annotated with its locale and
   * the timestamp of its most recent message.
   *
   * Implementation notes:
   *  - LEFT JOIN on `chat_messages` so sessions with no messages still appear
   *    (their `lastMessageAt` is `null`).
   *  - GROUP BY `s.id` is sufficient on Postgres (functional dependency on PK).
   *  - ORDER BY `s.createdAt DESC` matches the locale-mode/p90 mergers' contract:
   *    most recent session first.
   *  - The `s."userId"` column name comes from the default `@JoinColumn` on
   *    `ChatSession.user` (camelCase, double-quoted because Postgres folds
   *    unquoted identifiers to lowercase).
   *
   * @param userId - Owning user id.
   * @param limit - Maximum number of rows to return.
   */
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
