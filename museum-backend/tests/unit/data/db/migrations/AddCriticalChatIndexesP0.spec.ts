import 'reflect-metadata';
import { DataSource } from 'typeorm';

import { AddCriticalChatIndexesP01777568348067 } from '@data/db/migrations/1777568348067-AddCriticalChatIndexesP0';

/**
 * Documentation-grade idempotence spec for the A1 P0 chat FK index migration.
 *
 * `describe.skip` by default — this suite needs a live Postgres DataSource
 * (set TEST_DATABASE_URL pointing to an ISOLATED test DB) and would slow CI.
 *
 * Run manually when authoring or refactoring this migration:
 *
 *   TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5433/migration_test \
 *     pnpm test -- --testPathPattern=AddCriticalChatIndexesP0 --coverage=false
 *
 * The suite verifies that the migration:
 *   - declares `transaction = false` so CONCURRENTLY can run;
 *   - is idempotent (`up` and `down` both safe to re-run);
 *   - restores the three indexes after a down → up round-trip.
 */
describe.skip('AddCriticalChatIndexesP01777568348067 migration', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      url: process.env.TEST_DATABASE_URL,
      entities: [],
      migrations: [AddCriticalChatIndexesP01777568348067],
      migrationsRun: false,
      synchronize: false,
    });
    await dataSource.initialize();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('declares transaction = false (CONCURRENTLY requirement)', () => {
    const m = new AddCriticalChatIndexesP01777568348067();
    expect(m.transaction).toBe(false);
  });

  it('up runs cleanly twice (idempotent)', async () => {
    const m = new AddCriticalChatIndexesP01777568348067();
    const qr = dataSource.createQueryRunner();
    try {
      await m.up(qr);
      await m.up(qr);
    } finally {
      await qr.release();
    }
  });

  it('down runs cleanly twice (idempotent)', async () => {
    const m = new AddCriticalChatIndexesP01777568348067();
    const qr = dataSource.createQueryRunner();
    try {
      await m.down(qr);
      await m.down(qr);
    } finally {
      await qr.release();
    }
  });

  it('up after down restores all three indexes', async () => {
    const m = new AddCriticalChatIndexesP01777568348067();
    const qr = dataSource.createQueryRunner();
    try {
      await m.down(qr);
      await m.up(qr);
      const rows = (await qr.query(`SELECT indexname FROM pg_indexes WHERE indexname = ANY($1)`, [
        [
          'IDX_chat_messages_sessionId',
          'IDX_chat_sessions_userId',
          'IDX_artwork_matches_messageId',
        ],
      ])) as { indexname: string }[];
      expect(rows.length).toBe(3);
    } finally {
      await qr.release();
    }
  });
});
