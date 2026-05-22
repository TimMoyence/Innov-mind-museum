/**
 * R5 — Langfuse ctor MUST be invoked with `mask: stripFreeText` when
 * env.langfuse.enabled=true and keys are present. Pins the boot-time wiring
 * that closes Vecteur 2 (Langfuse free-text PII).
 *
 * Companion ctor-tests at langfuse-client.test.ts cover other env branches
 * (disabled, missing keys, SDK load failure). This file scopes ONLY to the
 * `mask` option presence (R5 + R9 invariant).
 *
 * RED: today langfuse.client.ts builds the ctor without `mask` → toHaveBeenCalledWith
 * matching `mask: any function` fails. GREEN: mask wired → assertion passes.
 */

export {}; // ensure this file is treated as a module (scopes helper names)

jest.mock('dotenv', () => ({ config: jest.fn() }));

interface LangfuseEnvShape {
  enabled: boolean;
  publicKey?: string;
  secretKey?: string;
  host?: string;
}

interface LoggerMock {
  info: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
  debug: jest.Mock;
}

const makeEnvMock = (langfuse: LangfuseEnvShape | undefined) => ({
  env: { langfuse },
});

const makeLoggerMock = (): LoggerMock => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
});

describe('langfuse.client — R5 mask ctor wiring', () => {
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

  it('passes mask: <Function> to Langfuse ctor when enabled (R5)', () => {
    jest.doMock('@src/config/env', () =>
      makeEnvMock({
        enabled: true,
        publicKey: 'pk-test',
        secretKey: 'sk-test',
        host: 'https://test.langfuse.com',
      }),
    );

    const constructorSpy = jest.fn();
    class FakeLangfuseCtor {
      public shutdownAsync = jest.fn<Promise<void>, []>().mockResolvedValue(undefined);
      public on = jest.fn<() => void, [string, (...args: unknown[]) => void]>(() => () => {});
      constructor(cfg: Record<string, unknown>) {
        constructorSpy(cfg);
      }
    }
    jest.doMock('langfuse', () => ({ Langfuse: FakeLangfuseCtor }));

    const mod =
      require('@shared/observability/langfuse.client') as typeof import('@shared/observability/langfuse.client');

    const client = mod.getLangfuse();
    expect(client).not.toBeNull();

    expect(constructorSpy).toHaveBeenCalledTimes(1);
    expect(constructorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        publicKey: 'pk-test',
        secretKey: 'sk-test',
        baseUrl: 'https://test.langfuse.com',
        flushAt: 10,
        flushInterval: 5_000,
        mask: expect.any(Function),
      }),
    );
  });

  it('mask is callable and shape-preserving on safe input (no PII present)', () => {
    jest.doMock('@src/config/env', () =>
      makeEnvMock({
        enabled: true,
        publicKey: 'pk-test',
        secretKey: 'sk-test',
        host: 'https://test.langfuse.com',
      }),
    );

    const constructorSpy = jest.fn();
    class FakeLangfuseCtor {
      public shutdownAsync = jest.fn<Promise<void>, []>().mockResolvedValue(undefined);
      public on = jest.fn<() => void, [string, (...args: unknown[]) => void]>(() => () => {});
      constructor(cfg: Record<string, unknown>) {
        constructorSpy(cfg);
      }
    }
    jest.doMock('langfuse', () => ({ Langfuse: FakeLangfuseCtor }));

    const mod =
      require('@shared/observability/langfuse.client') as typeof import('@shared/observability/langfuse.client');

    mod.getLangfuse();

    const cfg = constructorSpy.mock.calls[0]?.[0] as { mask?: (p: { data: unknown }) => unknown };
    expect(cfg.mask).toBeDefined();
    expect(typeof cfg.mask).toBe('function');

    // Safe body without free-text: mask must NOT mutate metadata.
    const safe = { data: { metadata: { museumId: 'm1', intent: 'art' } } };
    const out = cfg.mask!(safe) as typeof safe;
    expect(out.data.metadata).toEqual({ museumId: 'm1', intent: 'art' });
  });

  it('R9 invariant — ctor NOT called when env.langfuse.enabled=false (mask never instantiated)', () => {
    jest.doMock('@src/config/env', () => makeEnvMock({ enabled: false }));

    const constructorSpy = jest.fn();
    class FakeLangfuseCtor {
      public shutdownAsync = jest.fn<Promise<void>, []>().mockResolvedValue(undefined);
      public on = jest.fn<() => void, [string, (...args: unknown[]) => void]>(() => () => {});
      constructor(cfg: Record<string, unknown>) {
        constructorSpy(cfg);
      }
    }
    jest.doMock('langfuse', () => ({ Langfuse: FakeLangfuseCtor }));

    const mod =
      require('@shared/observability/langfuse.client') as typeof import('@shared/observability/langfuse.client');

    expect(mod.getLangfuse()).toBeNull();
    expect(constructorSpy).not.toHaveBeenCalled();
  });
});
