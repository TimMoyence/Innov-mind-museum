import { logger } from '@shared/logger/logger';

describe('logger', () => {
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('logs info as JSON with level, message, and timestamp', () => {
    logger.info('test_info');

    expect(logSpy).toHaveBeenCalledTimes(1);
    const output = JSON.parse(logSpy.mock.calls[0][0]);
    expect(output.level).toBe('info');
    expect(output.message).toBe('test_info');
    expect(new Date(output.timestamp).getTime()).not.toBeNaN();
    expect(output.service).toBe('museum-backend');
  });

  it('logs info with context', () => {
    logger.info('test_info', { requestId: 'r1', extra: 42 });

    const output = JSON.parse(logSpy.mock.calls[0][0]);
    expect(output.requestId).toBe('r1');
    expect(output.extra).toBe(42);
  });

  it('logs warn to console.warn', () => {
    logger.warn('test_warn');

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const output = JSON.parse(warnSpy.mock.calls[0][0]);
    expect(output.level).toBe('warn');
    expect(output.message).toBe('test_warn');
  });

  it('logs warn with context', () => {
    logger.warn('test_warn', { key: 'value' });

    const output = JSON.parse(warnSpy.mock.calls[0][0]);
    expect(output.key).toBe('value');
  });

  it('logs error to console.error', () => {
    logger.error('test_error');

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const output = JSON.parse(errorSpy.mock.calls[0][0]);
    expect(output.level).toBe('error');
    expect(output.message).toBe('test_error');
  });

  it('logs error with context', () => {
    logger.error('test_error', { error: 'something broke' });

    const output = JSON.parse(errorSpy.mock.calls[0][0]);
    expect(output.error).toBe('something broke');
  });

  it('includes default fields in all log levels', () => {
    logger.info('test');
    logger.warn('test');
    logger.error('test');

    for (const spy of [logSpy, warnSpy, errorSpy]) {
      const output = JSON.parse(spy.mock.calls[0][0]);
      expect(output.service).toBe('museum-backend');
      expect(typeof output.environment).toBe('string');
      expect(typeof output.version).toBe('string');
      expect(typeof output.hostname).toBe('string');
    }
  });

  it('logs without context (undefined context branch)', () => {
    logger.info('no_context');

    const output = JSON.parse(logSpy.mock.calls[0][0]);
    expect(output.message).toBe('no_context');
    // Should only have default fields, no extra context keys
  });

  // Kills L13 ObjectLiteral → {}: an empty defaultFields strips every literal
  // value out of the emitted JSON. Asserting each field by exact value (not
  // typeof) makes the mutation observable on the first log call.
  it('emits service="museum-backend" verbatim (not just a string-typed value)', () => {
    logger.info('x');
    const output = JSON.parse(logSpy.mock.calls[0][0]);
    expect(output.service).toBe('museum-backend');
  });

  it('emits hostname matching os.hostname() exactly', () => {
    // Lazy-require os to avoid hoisting issues; both runtime and test use the
    // same Node binary so os.hostname() is identical.
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- minimal local require, hostname is invariant across the test
    const { hostname } = require('node:os') as typeof import('node:os');
    logger.info('x');
    const output = JSON.parse(logSpy.mock.calls[0][0]);
    expect(output.hostname).toBe(hostname());
  });
});

// Kills L13 ObjectLiteral, L14 StringLiteral, L15/L16 LogicalOperator, and
// L16 StringLiteral mutations on the static defaultFields object by
// re-evaluating the module under controlled process.env states.
describe('logger defaultFields under various env states', () => {
  /**
   * @param env
   * @param body
   */
  function withEnv(
    env: Record<string, string | undefined>,
    body: (out: Record<string, unknown>) => void,
  ): void {
    const prev = { ...process.env };
    for (const [k, v] of Object.entries(env)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    try {
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic re-import to re-evaluate the module-level defaultFields with the env override active
        const fresh = require('@shared/logger/logger') as typeof import('@shared/logger/logger');
        const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
        try {
          fresh.logger.info('probe');
          const output = JSON.parse(spy.mock.calls[0][0] as string) as Record<string, unknown>;
          body(output);
        } finally {
          spy.mockRestore();
        }
      });
    } finally {
      process.env = prev;
    }
  }

  it('uses NODE_ENV when set', () => {
    withEnv({ NODE_ENV: 'staging' }, (out) => {
      expect(out.environment).toBe('staging');
    });
  });

  it('falls back to "development" when NODE_ENV is unset', () => {
    withEnv({ NODE_ENV: undefined }, (out) => {
      expect(out.environment).toBe('development');
    });
  });

  it('uses APP_VERSION when set (takes precedence over npm_package_version)', () => {
    withEnv({ APP_VERSION: '9.9.9', npm_package_version: '7.7.7' }, (out) => {
      expect(out.version).toBe('9.9.9');
    });
  });

  it('falls back to npm_package_version when APP_VERSION is unset', () => {
    withEnv({ APP_VERSION: undefined, npm_package_version: '7.7.7' }, (out) => {
      expect(out.version).toBe('7.7.7');
    });
  });

  it('falls back to "unknown" when neither APP_VERSION nor npm_package_version are set', () => {
    withEnv({ APP_VERSION: undefined, npm_package_version: undefined }, (out) => {
      expect(out.version).toBe('unknown');
    });
  });

  it('emits service="museum-backend" even after module re-evaluation', () => {
    withEnv({}, (out) => {
      expect(out.service).toBe('museum-backend');
    });
  });
});
