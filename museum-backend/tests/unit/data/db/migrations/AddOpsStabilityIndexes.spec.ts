import 'reflect-metadata';

import { AddOpsStabilityIndexes1779707124179 } from '@data/db/migrations/1779707124179-AddOpsStabilityIndexes';

import type { QueryRunner } from 'typeorm';

/**
 * I-OPS7 — three missing DB indices added via a single CONCURRENTLY migration.
 *
 * Mirrors the A1 pattern (`AddCriticalChatIndexesP0.spec.ts`) but asserts the
 * emitted SQL against a mock `QueryRunner` (`jest.fn()`), so no live Postgres
 * is required: CONCURRENTLY index migrations declare `transaction = false`,
 * which would otherwise have to be exercised against a real connection.
 *
 * Asserts:
 *   - `transaction === false` (CONCURRENTLY requirement, MIGRATION_GOVERNANCE §4)
 *   - `up()` issues exactly 3 `CREATE INDEX CONCURRENTLY IF NOT EXISTS`:
 *       IDX_api_keys_user_id              ON api_keys("user_id")
 *       IDX_chat_sessions_userId_updatedAt_id ON chat_sessions("userId","updatedAt","id")
 *       IDX_chat_sessions_purged_at_active    ON chat_sessions("updatedAt") WHERE "purged_at" IS NULL
 *   - `down()` issues 3 symmetric `DROP INDEX CONCURRENTLY IF EXISTS`
 */

interface RunnerStub {
  query: jest.Mock<Promise<unknown>, [string]>;
}

const makeRunner = (): RunnerStub => ({
  query: jest.fn().mockResolvedValue(undefined),
});

// Collapses whitespace so SQL fragment assertions ignore formatting.
const normalize = (sql: string): string => sql.replace(/\s+/g, ' ').trim();

const issuedQueries = (runner: RunnerStub): string[] =>
  runner.query.mock.calls.map((call) => normalize(call[0]));

describe('AddOpsStabilityIndexes migration (I-OPS7)', () => {
  it('declares transaction = false (CONCURRENTLY requirement)', () => {
    const migration = new AddOpsStabilityIndexes1779707124179();
    expect(migration.transaction).toBe(false);
  });

  describe('up()', () => {
    it('issues exactly 3 CREATE INDEX CONCURRENTLY IF NOT EXISTS statements', async () => {
      const runner = makeRunner();
      const migration = new AddOpsStabilityIndexes1779707124179();

      await migration.up(runner as unknown as QueryRunner);

      const queries = issuedQueries(runner);
      expect(queries).toHaveLength(3);
      for (const q of queries) {
        expect(q).toMatch(/CREATE INDEX CONCURRENTLY IF NOT EXISTS/i);
      }
    });

    it('creates IDX_api_keys_user_id on api_keys("user_id")', async () => {
      const runner = makeRunner();
      const migration = new AddOpsStabilityIndexes1779707124179();

      await migration.up(runner as unknown as QueryRunner);

      const queries = issuedQueries(runner);
      const idx = queries.find((q) => q.includes('IDX_api_keys_user_id'));
      expect(idx).toBeDefined();
      expect(idx).toMatch(/ON "api_keys" \("user_id"\)/i);
    });

    it('creates the composite IDX_chat_sessions_userId_updatedAt_id on ("userId","updatedAt","id")', async () => {
      const runner = makeRunner();
      const migration = new AddOpsStabilityIndexes1779707124179();

      await migration.up(runner as unknown as QueryRunner);

      const queries = issuedQueries(runner);
      const idx = queries.find((q) => q.includes('IDX_chat_sessions_userId_updatedAt_id'));
      expect(idx).toBeDefined();
      expect(idx).toMatch(/ON "chat_sessions" \("userId", "updatedAt", "id"\)/i);
    });

    it('creates the partial IDX_chat_sessions_purged_at_active with WHERE "purged_at" IS NULL', async () => {
      const runner = makeRunner();
      const migration = new AddOpsStabilityIndexes1779707124179();

      await migration.up(runner as unknown as QueryRunner);

      const queries = issuedQueries(runner);
      const idx = queries.find((q) => q.includes('IDX_chat_sessions_purged_at_active'));
      expect(idx).toBeDefined();
      expect(idx).toMatch(/ON "chat_sessions" \("updatedAt"\)/i);
      expect(idx).toMatch(/WHERE "purged_at" IS NULL/i);
    });
  });

  describe('down()', () => {
    it('issues exactly 3 DROP INDEX CONCURRENTLY IF EXISTS statements for the same indices', async () => {
      const runner = makeRunner();
      const migration = new AddOpsStabilityIndexes1779707124179();

      await migration.down(runner as unknown as QueryRunner);

      const queries = issuedQueries(runner);
      expect(queries).toHaveLength(3);
      for (const q of queries) {
        expect(q).toMatch(/DROP INDEX CONCURRENTLY IF EXISTS/i);
      }
      expect(queries.some((q) => q.includes('IDX_api_keys_user_id'))).toBe(true);
      expect(queries.some((q) => q.includes('IDX_chat_sessions_userId_updatedAt_id'))).toBe(true);
      expect(queries.some((q) => q.includes('IDX_chat_sessions_purged_at_active'))).toBe(true);
    });
  });
});
