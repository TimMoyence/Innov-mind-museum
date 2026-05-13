/**
 * Tests for shared/observability/opentelemetry.ts conditional init + shutdown
 * branches. The module holds a singleton `sdkInstance` at module scope, so
 * each test resets modules and re-mocks the OTel CJS packages before
 * `require()`-ing the module under test.
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
 */
const wireOtelMocks = (shutdownImpl?: () => Promise<void>): OtelMocks => {
  const sdkInstance: FakeSdk = {
    start: jest.fn<void, []>(),
    shutdown: jest
      .fn<Promise<void>, []>()
      .mockImplementation(shutdownImpl ?? (() => Promise.resolve())),
  };
  const NodeSDK = jest.fn().mockImplementation(() => sdkInstance);
  const getNodeAutoInstrumentations = jest.fn().mockReturnValue([{ instrumentationName: 'auto' }]);
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

    // Auto-instrumentations disabled list
    expect(mocks.getNodeAutoInstrumentations).toHaveBeenCalledTimes(1);
    expect(mocks.getNodeAutoInstrumentations).toHaveBeenCalledWith({
      '@opentelemetry/instrumentation-fs': { enabled: false },
      '@opentelemetry/instrumentation-dns': { enabled: false },
      '@opentelemetry/instrumentation-router': { enabled: false },
    });

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

    // logger.info called with init event
    expect(loggerMock.info).toHaveBeenCalledTimes(1);
    expect(loggerMock.info).toHaveBeenCalledWith('opentelemetry_initialized', {
      endpoint: 'http://otel:4318',
      serviceName: 'museum-backend',
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
