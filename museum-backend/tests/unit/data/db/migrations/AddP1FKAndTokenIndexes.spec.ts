import 'reflect-metadata';
import { DataSource } from 'typeorm';

import { AddP1FKAndTokenIndexes1777617893834 } from '@data/db/migrations/1777617893834-AddP1FKAndTokenIndexes';

/**
 * Documentation-grade idempotence spec for the A2 P1 FK + token index
 * migration.
 *
 * `describe.skip` by default — this suite needs a live Postgres DataSource
 * (set TEST_DATABASE_URL pointing to an ISOLATED test DB that already has
 * the Musaium schema applied, e.g. via `pnpm migration:run` against that DB
 * first). The suite would also slow CI.
 *
 * Run manually when authoring or refactoring this migration:
 *
 *   TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5433/migration_test \
 *     pnpm test -- --testPathPattern=AddP1FKAndTokenIndexes --coverage=false
 *
 * The suite verifies that the migration:
 *   - declares `transaction = false` so CONCURRENTLY can run;
 *   - is idempotent (`up` and `down` both safe to re-run);
 *   - restores all five indexes after a down → up round-trip.
 */
describe.skip('AddP1FKAndTokenIndexes1777617893834 migration', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      url: process.env.TEST_DATABASE_URL,
      entities: [],
      migrations: [AddP1FKAndTokenIndexes1777617893834],
      migrationsRun: false,
      synchronize: false,
    });
    await dataSource.initialize();
  });

  afterAll(async () => {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  it('declares transaction = false (CONCURRENTLY requirement)', () => {
    const m = new AddP1FKAndTokenIndexes1777617893834();
    expect(m.transaction).toBe(false);
  });

  it('up runs cleanly twice (idempotent)', async () => {
    const m = new AddP1FKAndTokenIndexes1777617893834();
    const qr = dataSource.createQueryRunner();
    try {
      await m.up(qr);
      await m.up(qr);
    } finally {
      await qr.release();
    }
  });

  it('down runs cleanly twice (idempotent)', async () => {
    const m = new AddP1FKAndTokenIndexes1777617893834();
    const qr = dataSource.createQueryRunner();
    try {
      await m.down(qr);
      await m.down(qr);
    } finally {
      await qr.release();
    }
  });

  it('up after down restores all five indexes', async () => {
    const m = new AddP1FKAndTokenIndexes1777617893834();
    const qr = dataSource.createQueryRunner();
    try {
      await m.down(qr);
      await m.up(qr);
      const rows = (await qr.query(`SELECT indexname FROM pg_indexes WHERE indexname = ANY($1)`, [
        [
          'IDX_museum_enrichment_museumId',
          'IDX_support_tickets_assigned_to',
          'IDX_ticket_messages_sender_id',
          'IDX_users_reset_token',
          'IDX_users_email_change_token',
        ],
      ])) as { indexname: string }[];
      expect(rows.length).toBe(5);
    } finally {
      await qr.release();
    }
  });
});
