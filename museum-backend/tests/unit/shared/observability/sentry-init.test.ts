/**
 * RED-phase contract test for `museum-backend/src/shared/observability/sentry.ts`.
 *
 * UFR-022 fresh-context phase=red: these assertions MUST FAIL on current main
 * (the file currently lacks `tracePropagationTargets` and uses the deprecated
 * `profilesSampleRate` key). The phase=green editor is responsible for making
 * them pass byte-for-byte without modifying this test file (frozen-test).
 *
 * Spec mappings:
 *   - R1  (TD-SN-02): `tracePropagationTargets` declared, matches prod + dev.
 *   - R3  (TD-SN-04): `profileSessionSampleRate` + `profileLifecycle` set;
 *                     deprecated `profilesSampleRate` MUST be absent.
 *   - R10 (TD-SN-01 deferral guard):
 *           a. `skipOpenTelemetrySetup: true` preserved.
 *           b. `getDefaultIntegrationsWithoutPerformance()` still invoked.
 *   - NFR Privacy/GDPR guard: `sendDefaultPii: false` preserved.
 *
 * Test pattern (mirrors `tests/unit/shared/sentry.test.ts`):
 *   - `jest.mock('dotenv', ...)` prevents the host `.env` from re-injecting
 *     SENTRY_DSN AFTER we set it for this test.
 *   - `jest.mock('@shared/logger/logger', ...)` silences `logger.info(...)`.
 *   - `jest.isolateModules` re-imports `sentry.ts` fresh so the `initialized`
 *     module-level flag does not leak across tests.
 *   - `jest.spyOn(Sentry, 'init').mockImplementation(...)` intercepts the
 *     options object passed by `initSentry()` so we can assert its shape.
 *
 * Lib-docs consulted (UFR-022):
 *   - `lib-docs/@sentry/node/PATTERNS.md` §3 DO `tracePropagationTargets`
 *     (lines 142-147), §3 DO `profileSessionSampleRate` (line 163),
 *     §4 DON'T deprecated `profilesSampleRate` (line 169),
 *     §5.5 `getDefaultIntegrationsWithoutPerformance` gap (lines 266-270).
 *
 * ESLint disables (lines 60, 69, 132, 144):
 *   Justification: jest.isolateModules requires CJS require() to re-instantiate the
 *   SUT module fresh per test — ESM dynamic import cannot satisfy the synchronous
 *   capture pattern (initSpy must be installed before initSentry() runs inside the
 *   isolated module scope). Mirrors tests/unit/shared/sentry.test.ts pattern.
 *   Approved-by: spec 2026-05-19-sentry-otel-followups FU-3 (design §9 D4).
 */

// Mirror `tests/unit/shared/sentry.test.ts:11` — see that file for rationale.
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

  /**
   * Drive `initSentry()` against a freshly-required module copy, with
   * `SENTRY_DSN` set so `env.sentry` is defined (and the init branch runs).
   * Returns the options object captured from the spied `Sentry.init` call.
   */
  function captureInitOptions(): Record<string, unknown> {
    let captured: Record<string, unknown> | undefined;

    jest.isolateModules(() => {
      process.env.SENTRY_DSN = 'https://test@sentry.example.com/1';

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Sentry = require('@sentry/node');

      const initSpy = jest.spyOn(Sentry, 'init').mockImplementation((opts: unknown) => {
        captured = opts as Record<string, unknown>;
        // Return a stub `Client` (not used by `initSentry`'s caller).
        return undefined as unknown as ReturnType<typeof Sentry.init>;
      });

      // eslint-disable-next-line @typescript-eslint/no-require-imports
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

    // Every entry must be a RegExp or string per Sentry's typed contract.
    for (const entry of targetArray) {
      expect(entry instanceof RegExp || typeof entry === 'string').toBe(true);
    }

    /**
     * Helper: does any entry in the allowlist match the candidate origin?
     * Matches Sentry's runtime semantics — `RegExp.test` for regex entries,
     * substring/equality for strings.
     * @param origin
     */
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

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Sentry = require('@sentry/node');

      // Spy BEFORE init runs so the spread `[...getDefaultIntegrationsWithoutPerformance()]`
      // is observed.
      defaultIntegrationsSpy = jest.spyOn(Sentry, 'getDefaultIntegrationsWithoutPerformance');

      jest.spyOn(Sentry, 'init').mockImplementation((opts: unknown) => {
        captured = opts as Record<string, unknown>;
        return undefined as unknown as ReturnType<typeof Sentry.init>;
      });

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { initSentry } = require('@shared/observability/sentry');
      initSentry();
    });

    if (!defaultIntegrationsSpy) {
      throw new Error('Spy on getDefaultIntegrationsWithoutPerformance not installed');
    }
    expect(defaultIntegrationsSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
    // Sanity: integrations is still an array (R10 — not nullified).
    expect(Array.isArray(captured?.integrations)).toBe(true);
  });

  it('preserves sendDefaultPii: false (NFR Privacy/GDPR guard)', () => {
    const opts = captureInitOptions();
    expect(opts.sendDefaultPii).toBe(false);
  });
});
