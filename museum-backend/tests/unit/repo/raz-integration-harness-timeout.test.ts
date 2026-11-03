import { createIntegrationHarness } from 'tests/helpers/integration/integration-harness';

describe('RAZ-M18-HARNESS-COLD-START', () => {
  let waitedMs = 0;

  beforeAll(async () => {
    const start = Date.now();
    await new Promise((resolve) => setTimeout(resolve, 5_500));
    waitedMs = Date.now() - start;
  });

  it('RAZ-M18-HARNESS-COLD-START · une suite qui importe le harnais tolère un démarrage à froid du conteneur au-delà de 5 s', () => {
    expect(typeof createIntegrationHarness).toBe('function');
    expect(waitedMs).toBeGreaterThanOrEqual(5_500);
  });
});
