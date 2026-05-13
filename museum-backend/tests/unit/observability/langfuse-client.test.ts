/**
 * Tests for shared/observability/langfuse.client.ts conditional construction +
 * shutdown branches. Module-level state (`_client`, `_warnedMissingKeys`,
 * `_LangfuseCtor`) requires `jest.resetModules()` between tests so each case
 * starts from a clean import.
 */

export {}; // ensure this file is treated as a module (scopes helper names)

// Prevent dotenv.config() (called inside @src/config/env) from re-injecting
// host-env LANGFUSE_* keys after the test overrides them.
jest.mock('dotenv', () => ({ config: jest.fn() }));

interface LoggerMock {
  info: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
  debug: jest.Mock;
}

interface LangfuseEnvShape {
  enabled: boolean;
  publicKey?: string;
  secretKey?: string;
  host?: string;
}

interface FakeLangfuse {
  shutdownAsync: jest.Mock<Promise<void>, []>;
}

/** Builds a mutable env mock that the module under test will read on import. */
const makeEnvMock = (
  langfuse: LangfuseEnvShape | undefined,
): { env: { langfuse: LangfuseEnvShape | undefined } } => ({
  env: { langfuse },
});

/** Builds a logger mock matching the shape of @shared/logger/logger. */
const makeLoggerMock = (): LoggerMock => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
});

describe('langfuse.client — getLangfuse', () => {
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

  it('returns null when env.langfuse is undefined (feature disabled)', () => {
    jest.doMock('@src/config/env', () => makeEnvMock(undefined));

    const mod =
      require('@shared/observability/langfuse.client') as typeof import('@shared/observability/langfuse.client');

    expect(mod.getLangfuse()).toBeNull();
    expect(loggerMock.warn).not.toHaveBeenCalled();
  });

  it('returns null when env.langfuse.enabled=false', () => {
    jest.doMock('@src/config/env', () => makeEnvMock({ enabled: false }));

    const mod =
      require('@shared/observability/langfuse.client') as typeof import('@shared/observability/langfuse.client');

    expect(mod.getLangfuse()).toBeNull();
    expect(loggerMock.warn).not.toHaveBeenCalled();
  });

  it('returns null and warns once when keys are missing', () => {
    jest.doMock('@src/config/env', () =>
      makeEnvMock({ enabled: true, host: 'http://langfuse.local' }),
    );

    const mod =
      require('@shared/observability/langfuse.client') as typeof import('@shared/observability/langfuse.client');

    expect(mod.getLangfuse()).toBeNull();
    expect(loggerMock.warn).toHaveBeenCalledTimes(1);
    expect(loggerMock.warn).toHaveBeenCalledWith(
      'LANGFUSE_ENABLED=true but LANGFUSE_PUBLIC_KEY or LANGFUSE_SECRET_KEY missing — telemetry disabled',
      { host: 'http://langfuse.local' },
    );

    // Second call must NOT re-warn (cache via _warnedMissingKeys)
    expect(mod.getLangfuse()).toBeNull();
    expect(loggerMock.warn).toHaveBeenCalledTimes(1);
  });

  it('returns null and warns when only publicKey present', () => {
    jest.doMock('@src/config/env', () =>
      makeEnvMock({ enabled: true, publicKey: 'pk_xx', host: 'http://langfuse.local' }),
    );

    const mod =
      require('@shared/observability/langfuse.client') as typeof import('@shared/observability/langfuse.client');

    expect(mod.getLangfuse()).toBeNull();
    expect(loggerMock.warn).toHaveBeenCalledTimes(1);
  });

  it('returns null and warns "SDK load failed" when require("langfuse") throws', () => {
    jest.doMock('@src/config/env', () =>
      makeEnvMock({
        enabled: true,
        publicKey: 'pk_xx',
        secretKey: 'sk_xx',
        host: 'http://langfuse.local',
      }),
    );
    const boom = new Error('boom');
    jest.doMock('langfuse', () => {
      throw boom;
    });

    const mod =
      require('@shared/observability/langfuse.client') as typeof import('@shared/observability/langfuse.client');

    expect(mod.getLangfuse()).toBeNull();
    expect(loggerMock.warn).toHaveBeenCalledTimes(1);
    expect(loggerMock.warn).toHaveBeenCalledWith('langfuse SDK load failed (telemetry disabled)', {
      err: boom,
    });
  });

  it('returns null when the langfuse module exports a falsy Langfuse export', () => {
    jest.doMock('@src/config/env', () =>
      makeEnvMock({
        enabled: true,
        publicKey: 'pk_xx',
        secretKey: 'sk_xx',
        host: 'http://langfuse.local',
      }),
    );
    jest.doMock('langfuse', () => ({ Langfuse: null }));

    const mod =
      require('@shared/observability/langfuse.client') as typeof import('@shared/observability/langfuse.client');

    expect(mod.getLangfuse()).toBeNull();
    // No warn here — the SDK loaded but the export was null; this is the
    // "ctor returns null" branch (no logging).
    expect(loggerMock.warn).not.toHaveBeenCalled();
  });

  it('constructs the client with the env config and caches it across calls', () => {
    jest.doMock('@src/config/env', () =>
      makeEnvMock({
        enabled: true,
        publicKey: 'pk_xx',
        secretKey: 'sk_xx',
        host: 'http://langfuse.local',
      }),
    );

    const constructorSpy = jest.fn();
    class FakeLangfuseCtor {
      public readonly cfg: Record<string, unknown>;
      public shutdownAsync = jest.fn<Promise<void>, []>().mockResolvedValue(undefined);
      constructor(cfg: Record<string, unknown>) {
        this.cfg = cfg;
        constructorSpy(cfg);
      }
    }
    jest.doMock('langfuse', () => ({ Langfuse: FakeLangfuseCtor }));

    const mod =
      require('@shared/observability/langfuse.client') as typeof import('@shared/observability/langfuse.client');

    const first = mod.getLangfuse();
    const second = mod.getLangfuse();

    expect(first).not.toBeNull();
    expect(first).toBe(second);
    expect(constructorSpy).toHaveBeenCalledTimes(1);
    expect(constructorSpy).toHaveBeenCalledWith({
      publicKey: 'pk_xx',
      secretKey: 'sk_xx',
      baseUrl: 'http://langfuse.local',
      flushAt: 10,
      flushInterval: 5_000,
    });
    expect(loggerMock.warn).not.toHaveBeenCalled();
  });
});

describe('langfuse.client — shutdownLangfuse', () => {
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

  it('is a no-op when no client was ever constructed', async () => {
    jest.doMock('@src/config/env', () => makeEnvMock(undefined));

    const mod =
      require('@shared/observability/langfuse.client') as typeof import('@shared/observability/langfuse.client');

    await expect(mod.shutdownLangfuse()).resolves.toBeUndefined();
    expect(loggerMock.warn).not.toHaveBeenCalled();
  });

  it('flushes pending spans via shutdownAsync on the constructed client', async () => {
    jest.doMock('@src/config/env', () =>
      makeEnvMock({
        enabled: true,
        publicKey: 'pk_xx',
        secretKey: 'sk_xx',
        host: 'http://langfuse.local',
      }),
    );

    const shutdownAsync = jest.fn<Promise<void>, []>().mockResolvedValue(undefined);
    class FakeLangfuseCtor {
      public shutdownAsync = shutdownAsync;
    }
    jest.doMock('langfuse', () => ({ Langfuse: FakeLangfuseCtor }));

    const mod =
      require('@shared/observability/langfuse.client') as typeof import('@shared/observability/langfuse.client');

    const client = mod.getLangfuse();
    expect(client).not.toBeNull();

    await mod.shutdownLangfuse();
    expect(shutdownAsync).toHaveBeenCalledTimes(1);

    // After shutdown the cached client is cleared → next get rebuilds.
    const rebuilt = mod.getLangfuse() as FakeLangfuse | null;
    expect(rebuilt).not.toBeNull();
    expect(rebuilt).not.toBe(client);
  });

  it('swallows shutdownAsync rejection and logs a warning', async () => {
    jest.doMock('@src/config/env', () =>
      makeEnvMock({
        enabled: true,
        publicKey: 'pk_xx',
        secretKey: 'sk_xx',
        host: 'http://langfuse.local',
      }),
    );

    const failure = new Error('drain failed');
    const shutdownAsync = jest.fn<Promise<void>, []>().mockRejectedValue(failure);
    class FakeLangfuseCtor {
      public shutdownAsync = shutdownAsync;
    }
    jest.doMock('langfuse', () => ({ Langfuse: FakeLangfuseCtor }));

    const mod =
      require('@shared/observability/langfuse.client') as typeof import('@shared/observability/langfuse.client');
    mod.getLangfuse();

    await expect(mod.shutdownLangfuse()).resolves.toBeUndefined();
    expect(shutdownAsync).toHaveBeenCalledTimes(1);
    expect(loggerMock.warn).toHaveBeenCalledTimes(1);
    expect(loggerMock.warn).toHaveBeenCalledWith('langfuse shutdownAsync failed (telemetry drop)', {
      err: failure,
    });
  });
});
