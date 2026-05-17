import type { AppEnv } from './env.types';

/**
 * Decoupled from `@shared/logger` so tests can inject a spy and module stays
 * import-safe during early boot (logger imports `env`).
 */
export interface InvariantsLogger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

export interface DeploymentInvariantsDeps {
  logger: InvariantsLogger;
  /** Called on invariant violation in prod. Default = process.exit(1). Tests inject spy. */
  exit: (code: number) => never;
}

// Kept in sync with legacy warning at `index.ts:78` for operator continuity.
const UNSAFE_MULTI_INSTANCE_MESSAGE =
  'Deployment invariant violation: DEPLOYMENT_MODE=multi (or auto-detected ' +
  'via PM2/K8s) requires shared Redis in production, but CACHE_ENABLED is false. ' +
  'In-memory rate-limit and cache stores are PER-REPLICA, so attackers can ' +
  'load-balance around rate limits and LLM cache is wasted. ' +
  'Fix: set CACHE_ENABLED=true and REDIS_URL=redis://... ' +
  '(or override with DEPLOYMENT_MODE=single if this really is a single-instance deployment).';

const defaultExit = ((code: number): never => {
  process.exit(code);
  // process.exit typed `never`, but TS needs explicit throw via narrowed signature.
  throw new Error('process.exit did not terminate');
}) as (code: number) => never;

const noopLog = (_message: string, _context?: Record<string, unknown>): void => undefined;
const noopLogger: InvariantsLogger = {
  info: noopLog,
  warn: noopLog,
  error: noopLog,
};

/**
 * Asserts declared/auto-detected topology is consistent with shared infra.
 *
 * Rules:
 *   - `multi` + `cache.enabled !== true` + `production` → hard fail
 *     (`process.exit(1)`), readiness probe fails, orchestrator stops rollout.
 *   - `multi` + `cache.enabled !== true` + dev/test → warn only.
 *   - `single` → no-op (in-memory fallback safe for single replica).
 *
 * Rate-limit note: no separate `RATE_LIMIT_STORE` knob. `RedisRateLimitStore`
 * wired in `src/index.ts` iff `env.cache.enabled === true` and shares Redis
 * with cache. Single `cache.enabled` check covers both.
 *
 * MUST be called BEFORE `server.listen()` so failed invariants crash fast
 * instead of half-booted silently-misconfigured server.
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
