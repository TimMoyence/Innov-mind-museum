import { Router } from 'express';

import adminRouter from '@modules/admin/adapters/primary/http/admin.route';
import authRouter from '@modules/auth/adapters/primary/http/auth.route';
import { createChatRouter } from '@modules/chat/adapters/primary/http/chat.route';
import { getArtKeywordRepository, getLlmCircuitBreakerState } from '@modules/chat/index';
import { createDailyArtRouter } from '@modules/daily-art/daily-art.route';
import { createMuseumRouter } from '@modules/museum/adapters/primary/http/museum.route';
import reviewRouter from '@modules/review/adapters/primary/http/review.route';
import supportRouter from '@modules/support/adapters/primary/http/support.route';
import { NoopCacheService } from '@shared/cache/noop-cache.service';
import { env } from '@src/config/env';

import type { ChatService } from '@modules/chat/useCase/chat.service';
import type { CacheService } from '@shared/cache/cache.port';
import type { FeatureFlagService } from '@shared/feature-flags/feature-flags.port';

/** Dependencies required to build the top-level API router. */
interface ApiRouterDeps {
  chatService: ChatService;
  healthCheck: () => Promise<{ database: 'up' | 'down' }>;
  featureFlagService: FeatureFlagService;
  cacheService?: CacheService;
}

/** Shape of the JSON response returned by the GET /api/health endpoint. */
export interface HealthPayload {
  status: 'ok' | 'degraded';
  checks: {
    database: 'up' | 'down';
    llmConfigured: boolean;
    redis?: 'up' | 'down' | 'skipped';
    llmCircuitBreaker?: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  };
  environment: string;
  version: string;
  timestamp: string;
  commitSha?: string;
  responseTimeMs?: number;
}

const resolveAppVersion = (): string => {
  const explicitVersion = process.env.APP_VERSION?.trim();
  if (explicitVersion) {
    return explicitVersion;
  }

  const packageVersion = process.env.npm_package_version?.trim();
  if (packageVersion) {
    return packageVersion;
  }

  return 'unknown';
};

const resolveCommitSha = (): string | undefined => {
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string fallback
  const source = process.env.COMMIT_SHA || process.env.GITHUB_SHA;
  const trimmed = source?.trim();
  return trimmed?.length ? trimmed : undefined;
};

/**
 * Builds a health-check response payload from the current system state.
 *
 * @param params - Database status and LLM configuration flag.
 * @param params.checks - Health check results.
 * @param params.checks.database - Database connectivity status.
 * @param params.checks.redis - Optional Redis connectivity status.
 * @param params.checks.llmCircuitBreaker - Optional LLM circuit breaker state.
 * @param params.llmConfigured - Whether at least one LLM provider is configured.
 * @returns Structured health payload with version and timestamp.
 */
export const buildHealthPayload = (params: {
  checks: {
    database: 'up' | 'down';
    redis?: 'up' | 'down' | 'skipped';
    llmCircuitBreaker?: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  };
  llmConfigured: boolean;
}): HealthPayload => {
  const dbUp = params.checks.database === 'up';
  const redisDown = params.checks.redis === 'down';
  const degraded = !dbUp || redisDown;

  const payload: HealthPayload = {
    status: degraded ? 'degraded' : 'ok',
    checks: {
      database: params.checks.database,
      llmConfigured: params.llmConfigured,
    },
    environment: env.nodeEnv,
    version: resolveAppVersion(),
    timestamp: new Date().toISOString(),
  };

  if (params.checks.redis !== undefined) {
    payload.checks.redis = params.checks.redis;
  }

  if (params.checks.llmCircuitBreaker !== undefined) {
    payload.checks.llmCircuitBreaker = params.checks.llmCircuitBreaker;
  }

  const commitSha = resolveCommitSha();
  if (commitSha) {
    payload.commitSha = commitSha;
  }

  return payload;
};

/**
 * Creates the top-level Express router that mounts /health, /chat, and /auth sub-routers.
 *
 * @param root0 - Injected dependencies.
 * @param root0.chatService - Chat service instance for the chat sub-router.
 * @param root0.healthCheck - Async function returning database health status.
 * @param root0.cacheService - Optional cache service for health check and route-level caching.
 * @returns Configured Express Router.
 */
export const createApiRouter = ({
  chatService,
  healthCheck,
  cacheService,
}: ApiRouterDeps): Router => {
  const router = Router();

  const REDIS_PING_TIMEOUT_MS = 2_000;

  router.get('/health', async (_req, res) => {
    res.set('Cache-Control', 'public, max-age=10, s-maxage=10');
    const start = Date.now();

    const isNoop = !cacheService || cacheService instanceof NoopCacheService;

    const [dbChecks, redisStatus] = await Promise.all([
      healthCheck(),
      isNoop
        ? Promise.resolve('skipped' as const)
        : Promise.race([
            cacheService.ping().then((ok) => (ok ? ('up' as const) : ('down' as const))),
            new Promise<'down'>((resolve) =>
              setTimeout(() => {
                resolve('down');
              }, REDIS_PING_TIMEOUT_MS),
            ),
          ]).catch(() => 'down' as const),
    ]);

    const responseTimeMs = Date.now() - start;
    const llmConfigured =
      (env.llm.provider === 'openai' && !!env.llm.openAiApiKey) ||
      (env.llm.provider === 'deepseek' && !!env.llm.deepseekApiKey) ||
      (env.llm.provider === 'google' && !!env.llm.googleApiKey);

    const cbState = getLlmCircuitBreakerState();

    const payload = buildHealthPayload({
      checks: {
        database: dbChecks.database,
        redis: redisStatus,
        llmCircuitBreaker: cbState?.state,
      },
      llmConfigured,
    });
    payload.responseTimeMs = responseTimeMs;

    const httpStatus = dbChecks.database === 'down' ? 503 : 200;
    res.status(httpStatus).json(payload);
  });

  router.use('/chat', createChatRouter(chatService, getArtKeywordRepository()));
  router.use('/auth', authRouter);
  router.use('/daily-art', createDailyArtRouter(cacheService));
  router.use('/museums', createMuseumRouter(cacheService));
  router.use('/admin', adminRouter);
  router.use('/support', supportRouter);
  router.use('/reviews', reviewRouter);

  return router;
};
