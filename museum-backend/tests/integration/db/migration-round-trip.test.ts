import {
  createIntegrationHarness,
  type IntegrationHarness,
} from 'tests/helpers/integration/integration-harness';
import { dumpSchemaFingerprint } from 'tests/helpers/integration/schema-fingerprint';

describe('migration round-trip [integration, real PG]', () => {
  jest.setTimeout(300_000);

  let harness: IntegrationHarness;

  beforeAll(async () => {
    harness = await createIntegrationHarness();
    harness.scheduleStop();
  });

  it('every migration applies up → down → up cleanly with stable schema', async () => {
    const ds = harness.dataSource;

    const schemaA = await dumpSchemaFingerprint(ds);

    const migrationCount = ds.migrations.length;
    expect(migrationCount).toBeGreaterThan(0);

    // 1. Roll every migration back, asserting each `down()` succeeds.
    // Use transaction: 'none' so that migrations with `transaction = false`
    // (e.g. CONCURRENTLY indexes — AddCriticalChatIndexesP0) are not
    // forcibly wrapped in a transaction.
    for (let i = 0; i < migrationCount; i += 1) {
      await ds.undoLastMigration({ transaction: 'none' });
    }

    const schemaEmpty = await dumpSchemaFingerprint(ds);
    expect(Object.keys(schemaEmpty.tables)).toEqual([]);

    // 2. Re-run all migrations.
    await ds.runMigrations({ transaction: 'none' });
    const schemaB = await dumpSchemaFingerprint(ds);

    // 3. Round-trip equality.
    expect(schemaB).toEqual(schemaA);
  });
});
