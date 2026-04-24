import { assertDeploymentInvariants } from '@src/config/deployment-invariants';

import type { DeploymentInvariantsDeps, InvariantsLogger } from '@src/config/deployment-invariants';
import type { AppEnv } from '@src/config/env.types';

/**
 * Builds the minimal env shape consumed by `assertDeploymentInvariants`.
 * Keeps tests focused on the fields under test.
 */
type InvariantEnv = Pick<AppEnv, 'deploymentMode' | 'nodeEnv' | 'cache'>;

function makeEnv(overrides: Partial<InvariantEnv> = {}): InvariantEnv {
  return {
    deploymentMode: 'single',
    nodeEnv: 'production',
    cache: undefined,
    ...overrides,
  };
}

function makeLogger(): InvariantsLogger & {
  info: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
} {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

describe('assertDeploymentInvariants', () => {
  let exit: jest.Mock<never, [number]>;
  let deps: Partial<DeploymentInvariantsDeps>;
  let logger: ReturnType<typeof makeLogger>;
  let stderrSpy: jest.SpyInstance;

  beforeEach(() => {
    exit = jest.fn((_code: number) => {
      // Do not actually exit. Returning `undefined` is fine because the
      // function return type is `never` only for production use.
      return undefined as never;
    });
    logger = makeLogger();
    deps = { logger, exit };
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  describe('single-instance mode', () => {
    it('single + cache disabled + prod: noop (legacy warning emitted elsewhere)', () => {
      const env = makeEnv({ deploymentMode: 'single', nodeEnv: 'production', cache: undefined });

      assertDeploymentInvariants(env, deps);

      expect(exit).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
      expect(logger.warn).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
    });

    it('single + cache enabled + prod: noop', () => {
      const env = makeEnv({
        deploymentMode: 'single',
        nodeEnv: 'production',
        cache: {
          enabled: true,
          url: 'redis://localhost:6379',
          sessionTtlSeconds: 3600,
          listTtlSeconds: 300,
          llmTtlSeconds: 604_800,
          llmPopularityTtlSeconds: 2_592_000,
          lowDataPackMaxEntries: 30,
        },
      });

      assertDeploymentInvariants(env, deps);

      expect(exit).not.toHaveBeenCalled();
    });
  });

  describe('multi-instance mode — production', () => {
    it('multi + cache disabled + prod: calls exit(1) and logs error', () => {
      const env = makeEnv({
        deploymentMode: 'multi',
        nodeEnv: 'production',
        cache: undefined,
      });

      assertDeploymentInvariants(env, deps);

      expect(exit).toHaveBeenCalledWith(1);
      expect(logger.error).toHaveBeenCalledWith(
        'deployment_invariants_violation',
        expect.objectContaining({
          deploymentMode: 'multi',
          nodeEnv: 'production',
          cacheEnabled: false,
        }),
      );
      expect(stderrSpy).toHaveBeenCalled();
      const stderrArg = stderrSpy.mock.calls[0]?.[0] as string;
      expect(stderrArg).toContain('CACHE_ENABLED=true');
      expect(stderrArg).toContain('REDIS_URL');
    });

    it('multi + cache enabled=false explicit + prod: calls exit(1)', () => {
      const env = makeEnv({
        deploymentMode: 'multi',
        nodeEnv: 'production',
        cache: {
          enabled: false,
          url: 'redis://localhost:6379',
          sessionTtlSeconds: 3600,
          listTtlSeconds: 300,
          llmTtlSeconds: 604_800,
          llmPopularityTtlSeconds: 2_592_000,
          lowDataPackMaxEntries: 30,
        } as AppEnv['cache'],
      });

      assertDeploymentInvariants(env, deps);

      expect(exit).toHaveBeenCalledWith(1);
    });

    it('multi + cache enabled + prod: noop, logs info ack', () => {
      const env = makeEnv({
        deploymentMode: 'multi',
        nodeEnv: 'production',
        cache: {
          enabled: true,
          url: 'redis://redis:6379',
          sessionTtlSeconds: 3600,
          listTtlSeconds: 300,
          llmTtlSeconds: 604_800,
          llmPopularityTtlSeconds: 2_592_000,
          lowDataPackMaxEntries: 30,
        },
      });

      assertDeploymentInvariants(env, deps);

      expect(exit).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        'deployment_invariants_ok',
        expect.objectContaining({ deploymentMode: 'multi', cacheEnabled: true }),
      );
    });
  });

  describe('multi-instance mode — non-production', () => {
    it.each(['development', 'test'] as const)(
      'multi + cache disabled + %s: warns, does NOT exit',
      (nodeEnv) => {
        const env = makeEnv({ deploymentMode: 'multi', nodeEnv, cache: undefined });

        assertDeploymentInvariants(env, deps);

        expect(exit).not.toHaveBeenCalled();
        expect(logger.warn).toHaveBeenCalledWith(
          'deployment_invariants_unsafe_nonprod',
          expect.objectContaining({ deploymentMode: 'multi', nodeEnv }),
        );
        expect(logger.error).not.toHaveBeenCalled();
      },
    );
  });

  describe('default deps fallback', () => {
    it('does not throw when called without deps (single mode)', () => {
      const env = makeEnv({ deploymentMode: 'single' });
      expect(() => {
        assertDeploymentInvariants(env);
      }).not.toThrow();
    });
  });
});

describe('env.ts deployment mode resolution', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  /**
   * Dynamically (re-)loads env.ts with controlled env vars. Mirrors the
   * pattern used by `env.test.ts`.
   * @param envOverrides
   */
  function loadEnv(envOverrides: Record<string, string | undefined> = {}) {
    const baseEnv: Record<string, string | undefined> = {
      ...originalEnv,
      NODE_ENV: 'test',
    };
    // Clear detection hints from the ambient shell unless overridden.
    for (const key of [
      'DEPLOYMENT_MODE',
      'NODE_APP_INSTANCE',
      'pm_id',
      'K8S_POD_NAME',
      'KUBERNETES_SERVICE_HOST',
    ]) {
      delete baseEnv[key];
    }
    process.env = { ...baseEnv, ...envOverrides } as NodeJS.ProcessEnv;
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic re-import needed for singleton
    const mod = require('@src/config/env') as typeof import('@src/config/env');
    return mod.env;
  }

  it('defaults to single when no hints are present', () => {
    const env = loadEnv();
    expect(env.deploymentMode).toBe('single');
  });

  it('honors explicit DEPLOYMENT_MODE=multi', () => {
    const env = loadEnv({ DEPLOYMENT_MODE: 'multi' });
    expect(env.deploymentMode).toBe('multi');
  });

  it('honors explicit DEPLOYMENT_MODE=single over auto-detect hints', () => {
    const env = loadEnv({ DEPLOYMENT_MODE: 'single', NODE_APP_INSTANCE: '0' });
    expect(env.deploymentMode).toBe('single');
  });

  it('ignores invalid DEPLOYMENT_MODE values and falls back to single', () => {
    const env = loadEnv({ DEPLOYMENT_MODE: 'cluster' });
    expect(env.deploymentMode).toBe('single');
  });

  it('auto-detects multi when NODE_APP_INSTANCE is set (PM2 cluster mode)', () => {
    const env = loadEnv({ NODE_APP_INSTANCE: '0' });
    expect(env.deploymentMode).toBe('multi');
  });

  it('auto-detects multi when KUBERNETES_SERVICE_HOST is set', () => {
    const env = loadEnv({ KUBERNETES_SERVICE_HOST: '10.0.0.1' });
    expect(env.deploymentMode).toBe('multi');
  });

  it('auto-detects multi when K8S_POD_NAME is set', () => {
    const env = loadEnv({ K8S_POD_NAME: 'musaium-api-abc123' });
    expect(env.deploymentMode).toBe('multi');
  });
});

describe('assertDeploymentInvariants — integration: auto-detect + cache disabled + prod', () => {
  it('NODE_APP_INSTANCE set + CACHE_ENABLED=false + prod: would exit', () => {
    // Simulate the end state: deploymentMode resolved to 'multi' via
    // auto-detect, cache disabled, production. We assert the guard exits.
    const env: InvariantEnv = {
      deploymentMode: 'multi',
      nodeEnv: 'production',
      cache: undefined,
    };
    const exit = jest.fn((_code: number) => undefined as never);
    const logger = makeLogger();
    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);

    assertDeploymentInvariants(env, { exit, logger });

    expect(exit).toHaveBeenCalledWith(1);
    expect(logger.error).toHaveBeenCalled();
    stderrSpy.mockRestore();
  });
});
