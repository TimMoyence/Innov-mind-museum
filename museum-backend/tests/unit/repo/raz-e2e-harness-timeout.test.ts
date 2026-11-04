import { createE2EHarness } from 'tests/helpers/e2e/e2e-app-harness';

describe('RAZ-M20-E2E-HARNESS-COLD-START', () => {
  let waitedMs = 0;

  beforeAll(async () => {
    const start = Date.now();
    await new Promise((resolve) => setTimeout(resolve, 5_600));
    waitedMs = Date.now() - start;
  });

  it('RAZ-M20-E2E-HARNESS-COLD-START · une suite e2e qui importe le harnais tolère un démarrage à froid au-delà de 5 s', () => {
    expect(typeof createE2EHarness).toBe('function');
    expect(waitedMs).toBeGreaterThanOrEqual(5_500);
  });
});
