import { UserMemory } from '../../domain/userMemory.entity';

import type {
  UserMemoryRepository,
  UserMemoryUpdates,
} from '../../domain/userMemory.repository.interface';
import type { DataSource, Repository } from 'typeorm';

/** TypeORM/PG implementation of {@link UserMemoryRepository}. */
export class TypeOrmUserMemoryRepository implements UserMemoryRepository {
  private readonly repo: Repository<UserMemory>;

  constructor(dataSource: DataSource) {
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
    const values: Record<string, unknown> = { userId, ...updates };

    await this.repo
      .createQueryBuilder()
      .insert()
      .into(UserMemory)
      .values(values as unknown as UserMemory)
      .orUpdate(
        Object.keys(updates).map((k) => this.camelToSnake(k)),
        ['user_id'],
      )
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

  /** Converts a camelCase property name to snake_case column name. */
  private camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  }
}
