import { DataSource, Repository } from 'typeorm';

import { UserMemory } from '../domain/userMemory.entity';
import type {
  UserMemoryRepository,
  UserMemoryUpdates,
} from '../domain/userMemory.repository.interface';

/** TypeORM/PG implementation of {@link UserMemoryRepository}. */
export class TypeOrmUserMemoryRepository implements UserMemoryRepository {
  private readonly repo: Repository<UserMemory>;

  constructor(dataSource: DataSource) {
    this.repo = dataSource.getRepository(UserMemory);
  }

  async getByUserId(userId: number): Promise<UserMemory | null> {
    return this.repo.findOne({ where: { userId } });
  }

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
    // Should always exist after upsert, but guard defensively.
    return row!;
  }

  async deleteByUserId(userId: number): Promise<void> {
    await this.repo.delete({ userId });
  }

  /** Converts a camelCase property name to snake_case column name. */
  private camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  }
}
