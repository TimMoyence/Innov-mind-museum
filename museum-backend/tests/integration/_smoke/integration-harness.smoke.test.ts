import {
  createIntegrationHarness,
  type IntegrationHarness,
} from 'tests/helpers/integration/integration-harness';

describe('integration-harness smoke [integration]', () => {
  jest.setTimeout(180_000);

  let harness: IntegrationHarness;

  beforeAll(async () => {
    harness = await createIntegrationHarness();
    harness.scheduleStop();
  });

  it('exposes a connected DataSource that can run trivial SQL', async () => {
    const result = await harness.dataSource.query('SELECT 1 as ok');
    expect(result).toEqual([{ ok: 1 }]);
  });

  it('reset() clears domain tables without dropping schema', async () => {
    await harness.dataSource.query(
      "INSERT INTO users (email, password, firstname, lastname, role) VALUES ('reset-test@example.com', 'h', 'a', 'b', 'visitor')",
    );
    await harness.reset();
    const after = await harness.dataSource.query(
      "SELECT count(*)::int AS c FROM users WHERE email = 'reset-test@example.com'",
    );
    expect(after).toEqual([{ c: 0 }]);
  });
});
