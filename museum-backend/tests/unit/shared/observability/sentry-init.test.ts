jest.mock('dotenv', () => ({ config: jest.fn() }));

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

describe('sentry — init options shape (RED contract)', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  function captureInitOptions(): Record<string, unknown> {
    let captured: Record<string, unknown> | undefined;

    jest.isolateModules(() => {
      process.env.SENTRY_DSN = 'https://test@sentry.example.com/1';

      const Sentry = require('@sentry/node');

      const initSpy = jest.spyOn(Sentry, 'init').mockImplementation((opts: unknown) => {
        captured = opts as Record<string, unknown>;
        return undefined as unknown as ReturnType<typeof Sentry.init>;
      });

      const { initSentry } = require('@shared/observability/sentry');
      initSentry();

      expect(initSpy).toHaveBeenCalledTimes(1);
    });

    if (!captured) {
      throw new Error('Sentry.init was not invoked — captureInitOptions failed');
    }
    return captured;
  }

  it('passes tracePropagationTargets matching api.musaium.com and localhost:3000', () => {
    const opts = captureInitOptions();

    expect(opts).toHaveProperty('tracePropagationTargets');
    const targets = opts.tracePropagationTargets;
    expect(Array.isArray(targets)).toBe(true);

    const targetArray = targets as (RegExp | string)[];
    expect(targetArray.length).toBeGreaterThanOrEqual(1);

    for (const entry of targetArray) {
      expect(entry instanceof RegExp || typeof entry === 'string').toBe(true);
    }

    const matches = (origin: string): boolean =>
      targetArray.some((entry) =>
        entry instanceof RegExp ? entry.test(origin) : origin.includes(entry),
      );

    expect(matches('https://api.musaium.com/v1/health')).toBe(true);
    expect(matches('http://localhost:3000/api/health')).toBe(true);
  });

  it('passes profileSessionSampleRate and profileLifecycle, never profilesSampleRate', () => {
    const opts = captureInitOptions();

    expect(opts).toHaveProperty('profileSessionSampleRate');
    expect(opts).toHaveProperty('profileLifecycle');
    expect(opts).not.toHaveProperty('profilesSampleRate');
  });

  it('preserves skipOpenTelemetrySetup: true (R10 — TD-SN-01 deferral guard)', () => {
    const opts = captureInitOptions();
    expect(opts.skipOpenTelemetrySetup).toBe(true);
  });

  it('preserves getDefaultIntegrationsWithoutPerformance() in integrations (R10)', () => {
    let captured: Record<string, unknown> | undefined;
    let defaultIntegrationsSpy: jest.SpyInstance | undefined;

    jest.isolateModules(() => {
      process.env.SENTRY_DSN = 'https://test@sentry.example.com/1';

      const Sentry = require('@sentry/node');

      defaultIntegrationsSpy = jest.spyOn(Sentry, 'getDefaultIntegrationsWithoutPerformance');

      jest.spyOn(Sentry, 'init').mockImplementation((opts: unknown) => {
        captured = opts as Record<string, unknown>;
        return undefined as unknown as ReturnType<typeof Sentry.init>;
      });

      const { initSentry } = require('@shared/observability/sentry');
      initSentry();
    });

    if (!defaultIntegrationsSpy) {
      throw new Error('Spy on getDefaultIntegrationsWithoutPerformance not installed');
    }
    expect(defaultIntegrationsSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(captured?.integrations)).toBe(true);
  });

  it('preserves sendDefaultPii: false (NFR Privacy/GDPR guard)', () => {
    const opts = captureInitOptions();
    expect(opts.sendDefaultPii).toBe(false);
  });
});
