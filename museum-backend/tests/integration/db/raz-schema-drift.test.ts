import {
  createIntegrationHarness,
  type IntegrationHarness,
} from 'tests/helpers/integration/integration-harness';

describe('RAZ-M1-DRIFT', () => {
  jest.setTimeout(300_000);

  let harness: IntegrationHarness;

  beforeAll(async () => {
    harness = await createIntegrationHarness();
    harness.scheduleStop();
  });

  it('RAZ-M1-DRIFT · une base migrée à neuf correspond exactement aux entités', async () => {
    const pending = await harness.dataSource.driver.createSchemaBuilder().log();

    expect(pending.upQueries.map((query) => query.query)).toEqual([]);
  });

  it("RAZ-B2B-SCHEMA · une base migrée à neuf n'a plus de table api_keys", async () => {
    const rows: { apiKeys: string | null; users: string | null }[] = await harness.dataSource.query(
      `SELECT to_regclass('public.api_keys')::text AS "apiKeys", to_regclass('public.users')::text AS "users"`,
    );

    expect(rows[0]).toEqual({ apiKeys: null, users: 'users' });
  });
});
