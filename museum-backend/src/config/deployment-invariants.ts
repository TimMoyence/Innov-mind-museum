import type { AppEnv } from './env.types';

/**
 * Minimal logger surface used by the invariants guard.
 *
 * Decoupled from `@shared/logger` so tests can inject a spy without stubbing
 * the singleton and so this module stays import-safe during early boot
 * (logger itself imports `env`).
 */
export interface InvariantsLogger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

/** Injectable deps for `assertDeploymentInvariants`. Enables testable exits. */
export interface DeploymentInvariantsDeps {
  logger: InvariantsLogger;
  /**
   * Called when the invariant is violated in production. Default implementation
   * prints to stderr and exits the process with code 1. Tests inject a spy.
   */
  exit: (code: number) => never;
}

/**
 * Fail-fast misconfiguration message printed to stderr before exit.
 * Kept in sync with the legacy warning at `index.ts:78` for operator continuity.
 */
const UNSAFE_MULTI_INSTANCE_MESSAGE =
  'Deployment invariant violation: DEPLOYMENT_MODE=multi (or auto-detected ' +
  'via PM2/K8s) requires shared Redis in production, but CACHE_ENABLED is false. ' +
  'In-memory rate-limit and cache stores are PER-REPLICA, so attackers can ' +
  'load-balance around rate limits and LLM cache is wasted. ' +
  'Fix: set CACHE_ENABLED=true and REDIS_URL=redis://... ' +
  '(or override with DEPLOYMENT_MODE=single if this really is a single-instance deployment).';

/**
 * Default exit implementation. Isolated so tests can inject a spy without
 * monkey-patching `process.exit`.
 */
const defaultExit = ((code: number): never => {
  process.exit(code);
  // `process.exit` is typed as `never` but TS needs the explicit throw below
  // when called through a narrowed signature in some configurations.
  throw new Error('process.exit did not terminate');
}) as (code: number) => never;

/** Fallback logger used when no logger is injected (keeps the guard usable in isolation). */
const noopLog = (_message: string, _context?: Record<string, unknown>): void => undefined;
const noopLogger: InvariantsLogger = {
  info: noopLog,
  warn: noopLog,
  error: noopLog,
};

/**
 * Asserts that the declared/auto-detected deployment topology is consistent
 * with the shared-infrastructure configuration.
 *
 * Rules:
 *   - `deploymentMode === 'multi'` AND `cache.enabled !== true` AND `NODE_ENV === 'production'`
 *     → hard fail (`process.exit(1)` via `deps.exit`), so the pod fails the
 *     readiness probe fast and the orchestrator stops rolling out.
 *   - `deploymentMode === 'multi'` AND `cache.enabled !== true` in
 *     `development`/`test` → warning only; dev ergonomics preserved.
 *   - `deploymentMode === 'single'` → no-op; the legacy in-memory fallback is
 *     still safe for a single replica.
 *
 * Rate-limit store note: this backend does not expose a separate
 * `RATE_LIMIT_STORE` knob. The Redis rate-limit store (`RedisRateLimitStore`)
 * is wired in `src/index.ts` iff `env.cache.enabled === true` and shares the
 * same Redis connection as the cache. Therefore the single `cache.enabled`
 * check covers both concerns.
 *
 * MUST be called BEFORE `server.listen()` so failed invariants result in a
 * fast crash rather than a half-booted, silently-misconfigured server.
 */
export function assertDeploymentInvariants(
  env: Pick<AppEnv, 'deploymentMode' | 'nodeEnv' | 'cache'>,
  deps: Partial<DeploymentInvariantsDeps> = {},
): void {
  const logger: InvariantsLogger = deps.logger ?? noopLogger;
  const exit = deps.exit ?? defaultExit;

  if (env.deploymentMode !== 'multi') {
    return;
  }

  const cacheEnabled = env.cache?.enabled === true;
  if (cacheEnabled) {
    logger.info('deployment_invariants_ok', {
      deploymentMode: env.deploymentMode,
      nodeEnv: env.nodeEnv,
      cacheEnabled: true,
    });
    return;
  }

  if (env.nodeEnv !== 'production') {
    logger.warn('deployment_invariants_unsafe_nonprod', {
      deploymentMode: env.deploymentMode,
      nodeEnv: env.nodeEnv,
      message:
        'Multi-instance deployment with CACHE_ENABLED=false. ' +
        'Safe in dev/test, but WILL fail hard in production. ' +
        'Set CACHE_ENABLED=true and REDIS_URL before promoting.',
    });
    return;
  }

  logger.error('deployment_invariants_violation', {
    deploymentMode: env.deploymentMode,
    nodeEnv: env.nodeEnv,
    cacheEnabled: false,
    message: UNSAFE_MULTI_INSTANCE_MESSAGE,
  });
  process.stderr.write(`${UNSAFE_MULTI_INSTANCE_MESSAGE}\n`);
  exit(1);
}
