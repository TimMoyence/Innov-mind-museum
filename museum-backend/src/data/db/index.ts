import { AppDataSource } from './data-source';

/**
 * Unified query interface backed by the TypeORM connection pool.
 * Replaces the former standalone pg.Pool — all repositories now share a single DB connection pool.
 * Returns { rows } for compatibility with existing repository code that used pg.Pool.
 */
const pool = {
  async query(sql: string, params?: unknown[]): Promise<{ rows: any[]; rowCount: number }> {
    const rows = await AppDataSource.query(sql, params);
    return { rows, rowCount: rows.length };
  },

  /**
   * Returns a client-like object for transaction support (BEGIN/COMMIT/ROLLBACK).
   * Backed by a TypeORM QueryRunner so everything stays on the same connection pool.
   */
  async connect(): Promise<{
    query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number }>;
    release: () => Promise<void>;
  }> {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    return {
      async query(sql: string, params?: unknown[]): Promise<{ rows: any[]; rowCount: number }> {
        const rows = await queryRunner.query(sql, params);
        return { rows, rowCount: rows.length };
      },
      async release(): Promise<void> {
        await queryRunner.release();
      },
    };
  },
};

export default pool;
