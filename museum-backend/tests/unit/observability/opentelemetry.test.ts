/**
 * Tests for shared/observability/opentelemetry.ts conditional init + shutdown
 * branches. The module holds a singleton `sdkInstance` at module scope, so
 * each test resets modules and re-mocks the OTel CJS packages before
 * `require()`-ing the module under test.
 *
 * RED phase (run `2026-07-14-otel-openai-instrumentation-kills-structured-llm`,
 * task T1.3 / T2.3) — cases UC-10, UC-23, UC-24, UC-25 (spec C-10, AC-3, AC-6).
 *
 * The frozen `getNodeAutoInstrumentations` argument (UC-10) and the frozen init
 * log payload (UC-23) are moved to the NEW TRUTH: a 4th disabled instrumentation
 * (`@opentelemetry/instrumentation-openai`) and an enumerated roster in the log.
 * They are NOT loosened to let the change through — no `objectContaining`, no
 * `expect.any`. Loosening them is precisely the shortcut C-10 forbids, and it is
 * how a "disabled" instrumentation could stay armed with a green suite.
 *
 * THE ONE MOCK THIS RUN ALLOWS. This file mocks the OTel packages, and that is
 * legitimate HERE and ONLY here, because what is asserted is the SHAPE of the
 * call and of the log — never the truth of the roster. The truth of the roster is
 * proved against the really-installed bundle by
 * `tests/integration/observability/otel-openai-structured-output.integration.test.ts`
 * (UC-3) and by the roster sentinel (UC-13). A mocked
 * `getNodeAutoInstrumentations` cannot see this bug: the instrumentation patches
 * the module loader from its CONSTRUCTOR, not from the call.
 */

export {}; // ensure this file is treated as a module (scopes helper names)

jest.mock('dotenv', () => ({ config: jest.fn() }));

interface LoggerMock {
  info: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
  debug: jest.Mock;
}

interface OtelEnvShape {
  enabled: true;
  exporterEndpoint: string;
  serviceName: string;
}

interface AppEnvShape {
  otel: OtelEnvShape | undefined;
  appVersion: string;
}

const makeEnvMock = (
  otel: OtelEnvShape | undefined,
  appVersion = '9.9.9',
): { env: AppEnvShape } => ({
  env: { otel, appVersion },
});

const makeLoggerMock = (): LoggerMock => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
});

interface FakeSdk {
  start: jest.Mock<void, []>;
  shutdown: jest.Mock<Promise<void>, []>;
}

interface OtelMocks {
  NodeSDK: jest.Mock;
  sdkInstance: FakeSdk;
  getNodeAutoInstrumentations: jest.Mock;
  OTLPTraceExporter: jest.Mock;
  resourceFromAttributes: jest.Mock;
  ATTR_SERVICE_NAME: string;
  ATTR_SERVICE_VERSION: string;
}

/**
 * Wires up jest.doMock for every OTel CJS package the module under test
 * `require()`s lazily inside initOpenTelemetry(). Returns the spies so each
 * test can assert call args.
 *
 * The factory closes over a single `sdkInstance` so the test can both observe
 * `start()` after init and stub `shutdown()` for the swallow-error branch.
 * @param shutdownImpl - optional impl for sdk.shutdown(); defaults to a
 *  resolved promise.
 * @param roster
 */
const wireOtelMocks = (
  shutdownImpl?: () => Promise<void>,
  roster: { instrumentationName: string }[] = [{ instrumentationName: 'auto' }],
): OtelMocks => {
  const sdkInstance: FakeSdk = {
    start: jest.fn<void, []>(),
    shutdown: jest
      .fn<Promise<void>, []>()
      .mockImplementation(shutdownImpl ?? (() => Promise.resolve())),
  };
  const NodeSDK = jest.fn().mockImplementation(() => sdkInstance);
  const getNodeAutoInstrumentations = jest.fn().mockReturnValue(roster);
  const OTLPTraceExporter = jest
    .fn()
    .mockImplementation((cfg: unknown) => ({ kind: 'exporter', cfg }));
  const resourceFromAttributes = jest
    .fn()
    .mockImplementation((attrs: Record<string, unknown>) => ({ kind: 'resource', attrs }));
  const ATTR_SERVICE_NAME = 'service.name';
  const ATTR_SERVICE_VERSION = 'service.version';

  jest.doMock('@opentelemetry/sdk-node', () => ({ NodeSDK }));
  jest.doMock('@opentelemetry/auto-instrumentations-node', () => ({ getNodeAutoInstrumentations }));
  jest.doMock('@opentelemetry/exporter-trace-otlp-http', () => ({ OTLPTraceExporter }));
  jest.doMock('@opentelemetry/resources', () => ({ resourceFromAttributes }));
  jest.doMock('@opentelemetry/semantic-conventions', () => ({
    ATTR_SERVICE_NAME,
    ATTR_SERVICE_VERSION,
  }));

  return {
    NodeSDK,
    sdkInstance,
    getNodeAutoInstrumentations,
    OTLPTraceExporter,
    resourceFromAttributes,
    ATTR_SERVICE_NAME,
    ATTR_SERVICE_VERSION,
  };
};

describe('opentelemetry — initOpenTelemetry', () => {
  let loggerMock: LoggerMock;

  beforeEach(() => {
    jest.resetModules();
    loggerMock = makeLoggerMock();
    jest.doMock('@shared/logger/logger', () => ({ logger: loggerMock }));
  });

  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  // UC-25 — `OTEL_ENABLED=false` (the repo default, env.ts:267): nothing is
  // required, nothing is constructed, the module loader is never patched. This is
  // both the cold-start guarantee AND the reason the default tree is healthy. It
  // bites the day an OTel import is hoisted to a module top level (cf. UC-9).
  it('returns immediately when env.otel is undefined (no SDK constructed)', () => {
    jest.doMock('@src/config/env', () => makeEnvMock(undefined));
    const mocks = wireOtelMocks();

    const mod =
      require('@shared/observability/opentelemetry') as typeof import('@shared/observability/opentelemetry');
    mod.initOpenTelemetry();

    expect(mocks.NodeSDK).not.toHaveBeenCalled();
    expect(mocks.getNodeAutoInstrumentations).not.toHaveBeenCalled();
    expect(mocks.OTLPTraceExporter).not.toHaveBeenCalled();
    expect(mocks.resourceFromAttributes).not.toHaveBeenCalled();
    expect(mocks.sdkInstance.start).not.toHaveBeenCalled();
    expect(loggerMock.info).not.toHaveBeenCalled();
  });

  it('constructs SDK with resource, exporter, instrumentations and starts it', () => {
    jest.doMock('@src/config/env', () =>
      makeEnvMock(
        {
          enabled: true,
          serviceName: 'museum-backend',
          exporterEndpoint: 'http://otel:4318',
        },
        '9.9.9',
      ),
    );
    const mocks = wireOtelMocks();

    const mod =
      require('@shared/observability/opentelemetry') as typeof import('@shared/observability/opentelemetry');
    mod.initOpenTelemetry();

    // Resource attributes
    expect(mocks.resourceFromAttributes).toHaveBeenCalledTimes(1);
    expect(mocks.resourceFromAttributes).toHaveBeenCalledWith({
      'service.name': 'museum-backend',
      'service.version': '9.9.9',
    });

    // Exporter URL = endpoint + /v1/traces
    expect(mocks.OTLPTraceExporter).toHaveBeenCalledTimes(1);
    expect(mocks.OTLPTraceExporter).toHaveBeenCalledWith({
      url: 'http://otel:4318/v1/traces',
    });

    // UC-10 — auto-instrumentations disabled list, at the NEW truth (4 keys).
    // `@opentelemetry/instrumentation-openai` double-reads the HTTP response body
    // (it `.then()`s the APIPromise that `withStructuredOutput` also unwraps), so
    // every structured section died with `TypeError: Body is unusable`.
    // FULL package name — a short key is a silent no-op in this bundle.
    expect(mocks.getNodeAutoInstrumentations).toHaveBeenCalledTimes(1);
    expect(mocks.getNodeAutoInstrumentations).toHaveBeenCalledWith({
      '@opentelemetry/instrumentation-fs': { enabled: false },
      '@opentelemetry/instrumentation-dns': { enabled: false },
      '@opentelemetry/instrumentation-router': { enabled: false },
      '@opentelemetry/instrumentation-openai': { enabled: false },
    });

    // …and the argument must BE the shared policy, not a literal copied next to
    // it: the roster sentinel reads that same module, and two sources of truth
    // mean the gate is guarding a fiction.
    const policyModule: {
      OTEL_AUTO_INSTRUMENTATION_POLICY?: unknown;
    } = require('@shared/observability/otel-instrumentation-policy');
    expect(mocks.getNodeAutoInstrumentations.mock.calls[0][0]).toBe(
      policyModule.OTEL_AUTO_INSTRUMENTATION_POLICY,
    );

    // NodeSDK ctor receives the wired pieces
    expect(mocks.NodeSDK).toHaveBeenCalledTimes(1);
    expect(mocks.NodeSDK).toHaveBeenCalledWith({
      resource: {
        kind: 'resource',
        attrs: { 'service.name': 'museum-backend', 'service.version': '9.9.9' },
      },
      traceExporter: { kind: 'exporter', cfg: { url: 'http://otel:4318/v1/traces' } },
      instrumentations: [[{ instrumentationName: 'auto' }]],
    });

    // start() called exactly once
    expect(mocks.sdkInstance.start).toHaveBeenCalledTimes(1);

    // UC-23 — the boot ENUMERATES the roster. "Which instrumentations are running
    // on this instance?" had no answer short of reading node_modules; that is a
    // large part of why a 100 %-failure outage lived ~2 months.
    expect(loggerMock.info).toHaveBeenCalledTimes(1);
    expect(loggerMock.info).toHaveBeenCalledWith('opentelemetry_initialized', {
      endpoint: 'http://otel:4318',
      serviceName: 'museum-backend',
      instrumentations: ['auto'],
      disabledInstrumentations: [
        '@opentelemetry/instrumentation-fs',
        '@opentelemetry/instrumentation-dns',
        '@opentelemetry/instrumentation-router',
        '@opentelemetry/instrumentation-openai',
      ],
    });
  });

  it('UC-24 — the logged roster DERIVES from the real return value (no hardcoded list)', () => {
    jest.doMock('@src/config/env', () =>
      makeEnvMock(
        {
          enabled: true,
          serviceName: 'museum-backend',
          exporterEndpoint: 'http://otel:4318',
        },
        '9.9.9',
      ),
    );
    // A value nobody could guess. A list written by hand in the log would satisfy
    // UC-23 and then LIE from the first bump onwards — i.e. on the exact day it is
    // needed. A log that lies is worse than no log.
    const mocks = wireOtelMocks(undefined, [
      { instrumentationName: 'SENTINEL-VALUE-X' },
      { instrumentationName: 'SENTINEL-VALUE-Y' },
    ]);

    const mod =
      require('@shared/observability/opentelemetry') as typeof import('@shared/observability/opentelemetry');
    mod.initOpenTelemetry();

    expect(mocks.getNodeAutoInstrumentations).toHaveBeenCalledTimes(1);
    expect(loggerMock.info).toHaveBeenCalledWith('opentelemetry_initialized', {
      endpoint: 'http://otel:4318',
      serviceName: 'museum-backend',
      instrumentations: ['SENTINEL-VALUE-X', 'SENTINEL-VALUE-Y'],
      disabledInstrumentations: [
        '@opentelemetry/instrumentation-fs',
        '@opentelemetry/instrumentation-dns',
        '@opentelemetry/instrumentation-router',
        '@opentelemetry/instrumentation-openai',
      ],
    });
  });

  it('re-invoking initOpenTelemetry rebuilds the SDK (no internal idempotency guard)', () => {
    // The source has no `if (sdkInstance) return` guard at the top of init —
    // documenting current behavior so a future refactor adding one is caught.
    jest.doMock('@src/config/env', () =>
      makeEnvMock(
        {
          enabled: true,
          serviceName: 'svc',
          exporterEndpoint: 'http://otel:4318',
        },
        '1.0.0',
      ),
    );
    const mocks = wireOtelMocks();

    const mod =
      require('@shared/observability/opentelemetry') as typeof import('@shared/observability/opentelemetry');
    mod.initOpenTelemetry();
    mod.initOpenTelemetry();

    expect(mocks.NodeSDK).toHaveBeenCalledTimes(2);
    expect(mocks.sdkInstance.start).toHaveBeenCalledTimes(2);
  });
});

describe('opentelemetry — shutdownOpenTelemetry', () => {
  let loggerMock: LoggerMock;

  beforeEach(() => {
    jest.resetModules();
    loggerMock = makeLoggerMock();
    jest.doMock('@shared/logger/logger', () => ({ logger: loggerMock }));
  });

  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  it('resolves silently when no SDK was ever started', async () => {
    jest.doMock('@src/config/env', () => makeEnvMock(undefined));
    const mocks = wireOtelMocks();

    const mod =
      require('@shared/observability/opentelemetry') as typeof import('@shared/observability/opentelemetry');

    await expect(mod.shutdownOpenTelemetry()).resolves.toBeUndefined();
    expect(mocks.sdkInstance.shutdown).not.toHaveBeenCalled();
  });

  it('delegates to sdkInstance.shutdown() after init', async () => {
    jest.doMock('@src/config/env', () =>
      makeEnvMock(
        {
          enabled: true,
          serviceName: 'svc',
          exporterEndpoint: 'http://otel:4318',
        },
        '1.0.0',
      ),
    );
    const mocks = wireOtelMocks();

    const mod =
      require('@shared/observability/opentelemetry') as typeof import('@shared/observability/opentelemetry');
    mod.initOpenTelemetry();

    await expect(mod.shutdownOpenTelemetry()).resolves.toBeUndefined();
    expect(mocks.sdkInstance.shutdown).toHaveBeenCalledTimes(1);
  });

  it('swallows sdkInstance.shutdown() rejection without rethrowing', async () => {
    jest.doMock('@src/config/env', () =>
      makeEnvMock(
        {
          enabled: true,
          serviceName: 'svc',
          exporterEndpoint: 'http://otel:4318',
        },
        '1.0.0',
      ),
    );
    const failure = new Error('flush failed');
    const mocks = wireOtelMocks(() => Promise.reject(failure));

    const mod =
      require('@shared/observability/opentelemetry') as typeof import('@shared/observability/opentelemetry');
    mod.initOpenTelemetry();

    await expect(mod.shutdownOpenTelemetry()).resolves.toBeUndefined();
    expect(mocks.sdkInstance.shutdown).toHaveBeenCalledTimes(1);
  });
});
