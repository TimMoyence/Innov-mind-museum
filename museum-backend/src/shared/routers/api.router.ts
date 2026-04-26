import { Router } from 'express';

import { createAdminKeRouter } from '@modules/admin/adapters/primary/http/admin-ke.route';
import adminRouter from '@modules/admin/adapters/primary/http/admin.route';
import { createCachePurgeRouter } from '@modules/admin/adapters/primary/http/cache-purge.route';
import authRouter from '@modules/auth/adapters/primary/http/auth.route';
import consentRouter from '@modules/auth/adapters/primary/http/consent.route';
import meRouter from '@modules/auth/adapters/primary/http/me.route';
import { createChatRouter } from '@modules/chat/adapters/primary/http/chat.route';
import {
  getArtKeywordRepository,
  getArtworkKnowledgeRepo,
  getDescribeService,
  getLlmCircuitBreakerState,
  getUserMemoryService,
} from '@modules/chat/wiring';
import { createDailyArtRouter } from '@modules/daily-art/daily-art.route';
import { buildEnrichMuseumUseCase, buildLowDataPackService } from '@modules/museum';
import { createLowDataPackRouter } from '@modules/museum/adapters/primary/http/low-data-pack.route';
import { createMuseumRouter } from '@modules/museum/adapters/primary/http/museum.route';
import { BullmqMuseumEnrichmentQueueAdapter } from '@modules/museum/adapters/secondary/bullmq-museum-enrichment-queue.adapter';
import reviewRouter from '@modules/review/adapters/primary/http/review.route';
import supportRouter from '@modules/support/adapters/primary/http/support.route';
import { NoopCacheService } from '@shared/cache/noop-cache.service';
import { env } from '@src/config/env';

import type { ChatService } from '@modules/chat/useCase/chat.service';
import type { EnrichMuseumUseCase } from '@modules/museum/useCase/enrichMuseum.useCase';
import type { CacheService } from '@shared/cache/cache.port';

/** Dependencies required to build the top-level API router. */
interface ApiRouterDeps {
  chatService: ChatService;
  healthCheck: () => Promise<{ database: 'up' | 'down' }>;
  cacheService?: CacheService;
}

/** Shape of the JSON response returned by the GET /api/health endpoint. */
export interface HealthPayload {
  status: 'ok' | 'degraded';
  checks: {
    database: 'up' | 'down';
    llmConfigured?: boolean;
    redis?: 'up' | 'down' | 'skipped';
    llmCircuitBreaker?: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  };
  environment?: string;
  version?: string;
  timestamp: string;
  commitSha?: string;
  responseTimeMs?: number;
}

/**
 * Builds a health-check response payload from the current system state.
 *
 * @param params - Database status and LLM configuration flag.
 * @param params.checks - Health check results.
 * @param params.checks.database - Database connectivity status.
 * @param params.checks.redis - Optional Redis connectivity status.
 * @param params.checks.llmCircuitBreaker - Optional LLM circuit breaker state.
 * @param params.llmConfigured - Whether at least one LLM provider is configured.
 * @param params.nodeEnv - Optional environment override for testing; defaults to `env.nodeEnv`.
 * @returns Structured health payload with version and timestamp.
 */
export const buildHealthPayload = (params: {
  checks: {
    database: 'up' | 'down';
    redis?: 'up' | 'down' | 'skipped';
    llmCircuitBreaker?: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  };
  llmConfigured: boolean;
  /**
   * Environment override for testing. Defaults to `env.nodeEnv`. In
   * production, sensitive metadata (commitSha, environment, version,
   * llmConfigured, llmCircuitBreaker, redis) is redacted (L4).
   */
  nodeEnv?: string;
}): HealthPayload => {
  const dbUp = params.checks.database === 'up';
  const redisDown = params.checks.redis === 'down';
  const degraded = !dbUp || redisDown;

  // SEC-HARDENING (L4): redact metadata in production to avoid
  // leaking commit SHA, environment, version, LLM provider state, or
  // circuit-breaker state to unauthenticated clients. Full payload is
  // still returned in non-production environments for operational use.
  const resolvedNodeEnv = params.nodeEnv ?? env.nodeEnv;
  const isProd = resolvedNodeEnv === 'production';

  const payload: HealthPayload = {
    status: degraded ? 'degraded' : 'ok',
    checks: {
      database: params.checks.database,
    },
    timestamp: new Date().toISOString(),
  };

  if (!isProd) {
    payload.checks.llmConfigured = params.llmConfigured;
    payload.environment = env.nodeEnv;
    payload.version = env.appVersion;

    if (params.checks.redis !== undefined) {
      payload.checks.redis = params.checks.redis;
    }

    if (params.checks.llmCircuitBreaker !== undefined) {
      payload.checks.llmCircuitBreaker = params.checks.llmCircuitBreaker;
    }

    if (env.commitSha) {
      payload.commitSha = env.commitSha;
    }
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
    // SEC-HARDENING (L4): responseTimeMs is a minor side-channel — only
    // expose it outside production.
    if (env.nodeEnv !== 'production') {
      payload.responseTimeMs = responseTimeMs;
    }

    const httpStatus = dbChecks.database === 'down' ? 503 : 200;
    res.status(httpStatus).json(payload);
  });

  mountDomainRouters(router, chatService, cacheService);

  return router;
};

/**
 * Singleton: holds the P3 enrichment use case + its BullMQ queue adapter.
 * Lazy so tests injecting their own chatService don't pay the Redis connect
 * cost, and so a missing Redis config degrades to 503 on /enrichment rather
 * than crashing boot.
 *
 * Gated by `env.extractionWorkerEnabled`: when false (e.g. e2e harness without
 * Redis), the BullMQ queue adapter is NEVER instantiated so no ioredis client
 * is opened and ECONNREFUSED log floods are avoided. The /museums/:id/enrichment
 * endpoint then degrades to "no use case" — same fail-open path as a Redis-down
 * production environment.
 */
let cachedEnrichUseCase: EnrichMuseumUseCase | null | undefined;

function resolveEnrichMuseumUseCase(): EnrichMuseumUseCase | undefined {
  if (cachedEnrichUseCase !== undefined) {
    return cachedEnrichUseCase ?? undefined;
  }
  if (!env.extractionWorkerEnabled) {
    cachedEnrichUseCase = null;
    return undefined;
  }
  try {
    const queue = new BullmqMuseumEnrichmentQueueAdapter({
      host: env.redis.host,
      port: env.redis.port,
      password: env.redis.password,
      maxRetriesPerRequest: null,
      enableOfflineQueue: false,
    });
    cachedEnrichUseCase = buildEnrichMuseumUseCase(queue);
    return cachedEnrichUseCase;
  } catch {
    cachedEnrichUseCase = null;
    return undefined;
  }
}

/** Mounts all domain sub-routers onto the top-level API router. */
function mountDomainRouters(
  router: Router,
  chatService: ChatService,
  cacheService?: CacheService,
): void {
  router.use(
    '/chat',
    createChatRouter(
      chatService,
      getArtKeywordRepository(),
      getUserMemoryService(),
      getDescribeService(),
    ),
  );
  router.use('/auth/consent', consentRouter);
  router.use('/auth', authRouter);
  // GDPR DSAR (Art 15 + 20) — `GET /api/users/me/export`. Always uses
  // `req.user.id`, never a path param, so an authenticated visitor cannot ask
  // for someone else's dossier (anti-IDOR per security audit § 3 T2).
  router.use('/users', meRouter);
  router.use('/daily-art', createDailyArtRouter(cacheService));
  router.use(
    '/museums',
    createMuseumRouter({ cacheService, enrichMuseumUseCase: resolveEnrichMuseumUseCase() }),
  );

  const resolvedCache = cacheService ?? new NoopCacheService();
  const lowDataPackService = buildLowDataPackService(resolvedCache);
  router.use('/', createLowDataPackRouter(lowDataPackService));

  router.use('/admin', adminRouter);
  router.use('/admin', createCachePurgeRouter(resolvedCache));
  const artworkKnowledgeRepo = getArtworkKnowledgeRepo();
  if (artworkKnowledgeRepo) {
    router.use('/admin', createAdminKeRouter(artworkKnowledgeRepo));
  }
  router.use('/support', supportRouter);
  router.use('/reviews', reviewRouter);
}
