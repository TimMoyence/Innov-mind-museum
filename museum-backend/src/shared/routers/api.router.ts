import { Router } from 'express';

import adminExportRouter from '@modules/admin/adapters/primary/http/routes/admin-export.route';
import { createAdminKeRouter } from '@modules/admin/adapters/primary/http/routes/admin-ke.route';
import adminRouter from '@modules/admin/adapters/primary/http/routes/admin.route';
import { createCachePurgeRouter } from '@modules/admin/adapters/primary/http/routes/cache-purge.route';
import authRouter from '@modules/auth/adapters/primary/http/routes/auth.route';
import consentRouter from '@modules/auth/adapters/primary/http/routes/consent.route';
import meRouter from '@modules/auth/adapters/primary/http/routes/me.route';
import { createChatRouter } from '@modules/chat/adapters/primary/http/routes/chat.route';
import {
  getArtKeywordRepository,
  getArtworkKnowledgeRepo,
  getCompareImageUseCase,
  getCompareSessionAccessVerifier,
  getLlmCircuitBreakerState,
  getMessageExplanationUseCase,
  getUpdateSessionContextUseCase,
  getUserMemoryService,
} from '@modules/chat/chat-module';
import { createDailyArtRouter } from '@modules/daily-art';
import leadsRouter from '@modules/leads/adapters/primary/http/routes/leads.route';
import {
  buildEnrichMuseumUseCase,
  buildLowDataPackService,
  detectMuseumUseCase,
} from '@modules/museum';
import { createLowDataPackRouter } from '@modules/museum/adapters/primary/http/routes/low-data-pack.route';
import { createMuseumRouter } from '@modules/museum/adapters/primary/http/routes/museum.route';
import { BullmqMuseumEnrichmentQueueAdapter } from '@modules/museum/adapters/secondary/enrichment/bullmq-museum-enrichment-queue.adapter';
import reviewRouter from '@modules/review/adapters/primary/http/routes/review.route';
import supportRouter from '@modules/support/adapters/primary/http/routes/support.route';
import telemetryRouter from '@modules/telemetry/adapters/primary/http/routes/funnel.route';
import { NoopCacheService } from '@shared/cache/noop-cache.service';
import { env } from '@src/config/env';

import type { ChatService } from '@modules/chat/useCase/orchestration/chat.service';
import type { EnrichMuseumUseCase } from '@modules/museum/useCase/enrichment/enrichMuseum.useCase';
import type { CacheService } from '@shared/cache/cache.port';

interface ApiRouterDeps {
  chatService: ChatService;
  healthCheck: () => Promise<{ database: 'up' | 'down' }>;
  cacheService?: CacheService;
}

type CircuitBreakerHealthState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface HealthPayload {
  status: 'ok' | 'degraded';
  checks: {
    database: 'up' | 'down';
    llmConfigured?: boolean;
    redis?: 'up' | 'down' | 'skipped';
    llmCircuitBreaker?: CircuitBreakerHealthState;
    llmGuard?: CircuitBreakerHealthState;
  };
  environment?: string;
  version?: string;
  timestamp: string;
  commitSha?: string;
  responseTimeMs?: number;
}

export const buildHealthPayload = (params: {
  checks: {
    database: 'up' | 'down';
    redis?: 'up' | 'down' | 'skipped';
    llmCircuitBreaker?: CircuitBreakerHealthState;
    llmGuard?: CircuitBreakerHealthState;
  };
  llmConfigured: boolean;
  nodeEnv?: string;
}): HealthPayload => {
  const dbUp = params.checks.database === 'up';
  const redisDown = params.checks.redis === 'down';
  const degraded = !dbUp || redisDown;

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

    if (params.checks.llmGuard !== undefined) {
      payload.checks.llmGuard = params.checks.llmGuard;
    }

    if (env.commitSha) {
      payload.commitSha = env.commitSha;
    }
  }

  return payload;
};

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
    if (env.nodeEnv !== 'production') {
      payload.responseTimeMs = responseTimeMs;
    }

    const httpStatus = dbChecks.database === 'down' ? 503 : 200;
    res.status(httpStatus).json(payload);
  });

  mountDomainRouters(router, chatService, cacheService);

  return router;
};

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

function mountDomainRouters(
  router: Router,
  chatService: ChatService,
  cacheService?: CacheService,
): void {
  router.use(
    '/chat',
    createChatRouter(chatService, {
      artKeywordRepo: getArtKeywordRepository(),
      userMemoryService: getUserMemoryService(),
      compareImageUseCase: getCompareImageUseCase(),
      compareSessionAccessVerifier: getCompareSessionAccessVerifier(),
      getMessageExplanationUseCase: getMessageExplanationUseCase(),
      updateSessionContextUseCase: getUpdateSessionContextUseCase(),
    }),
  );
  router.use('/auth/consent', consentRouter);
  router.use('/auth', authRouter);
  router.use('/users', meRouter);
  router.use('/daily-art', createDailyArtRouter(cacheService));
  router.use(
    '/museums',
    createMuseumRouter({
      cacheService,
      enrichMuseumUseCase: resolveEnrichMuseumUseCase(),
      detectMuseumUseCase,
    }),
  );

  const resolvedCache = cacheService ?? new NoopCacheService();
  const lowDataPackService = buildLowDataPackService(resolvedCache);
  router.use('/', createLowDataPackRouter(lowDataPackService));

  router.use('/admin', adminRouter);
  router.use('/admin', adminExportRouter);
  router.use('/admin', createCachePurgeRouter(resolvedCache));
  const artworkKnowledgeRepo = getArtworkKnowledgeRepo();
  if (artworkKnowledgeRepo) {
    router.use('/admin', createAdminKeRouter(artworkKnowledgeRepo));
  }
  router.use('/support', supportRouter);
  router.use('/reviews', reviewRouter);
  router.use('/leads', leadsRouter);
  router.use('/telemetry', telemetryRouter);
}
