import { Router } from 'express';

import adminExportRouter from '@modules/admin/adapters/primary/http/routes/admin-export.route';
import { createAdminKeRouter } from '@modules/admin/adapters/primary/http/routes/admin-ke.route';
import adminRouter from '@modules/admin/adapters/primary/http/routes/admin.route';
import { createCachePurgeRouter } from '@modules/admin/adapters/primary/http/routes/cache-purge.route';
import authRouter from '@modules/auth/adapters/primary/http/routes/auth.route';
import consentRouter from '@modules/auth/adapters/primary/http/routes/consent.route';
import meRouter from '@modules/auth/adapters/primary/http/routes/me.route';
import mfaRouter from '@modules/auth/adapters/primary/http/routes/mfa.route';
import { createChatRouter } from '@modules/chat/adapters/primary/http/routes/chat.route';
import {
  getArtKeywordRepository,
  getArtworkKnowledgeRepo,
  getCompareImageUseCase,
  getCompareSessionAccessVerifier,
  getDescribeService,
  getGuardrailProvider,
  getLlmCircuitBreakerState,
  getLlmGuardCircuitBreakerState,
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
import { NoopCacheService } from '@shared/cache/noop-cache.service';
import { env } from '@src/config/env';

import type { ProviderHealth } from '@modules/chat/domain/ports/guardrail-provider.port';
import type { ChatService } from '@modules/chat/useCase/orchestration/chat.service';
import type { EnrichMuseumUseCase } from '@modules/museum/useCase/enrichment/enrichMuseum.useCase';
import type { CacheService } from '@shared/cache/cache.port';
import type { Request, Response } from 'express';

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
    /** Additive 2026-05-12 ; same redaction posture as llmCircuitBreaker — non-prod only. */
    llmGuard?: CircuitBreakerHealthState;
  };
  environment?: string;
  version?: string;
  timestamp: string;
  commitSha?: string;
  responseTimeMs?: number;
}

/** SEC L4: production redacts commitSha/environment/version/llmConfigured/circuit-breakers/redis. */
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
    const guardCbState = getLlmGuardCircuitBreakerState();

    const payload = buildHealthPayload({
      checks: {
        database: dbChecks.database,
        redis: redisStatus,
        llmCircuitBreaker: cbState?.state,
        llmGuard: guardCbState?.state,
      },
      llmConfigured,
    });
    // SEC L4: responseTimeMs is a side-channel — non-prod only.
    if (env.nodeEnv !== 'production') {
      payload.responseTimeMs = responseTimeMs;
    }

    const httpStatus = dbChecks.database === 'down' ? 503 : 200;
    res.status(httpStatus).json(payload);
  });

  // Semantic deep-health (Phase 1 perennial). Exercises decision paths (sidecar /scan,
  // DB SELECT, Redis PING), aggregates qualitative verdict. Distinct from TCP-up — a
  // sidecar accepting connections but blocking every probe = `degraded`, not `up`.
  // Returns 200 even on down — body IS the status report.
  router.get('/health/deep', createDeepHealthHandler({ healthCheck, cacheService }));

  mountDomainRouters(router, chatService, cacheService);

  return router;
};

interface GuardrailHealthCheck extends ProviderHealth {
  name: string;
}

/**
 * Defence-in-depth try/catch — adapter promises `never throws` per port contract.
 * Forward-compatible with Phase 2 multi-provider aggregator (ADR-048).
 */
async function probeGuardrailProviders(): Promise<GuardrailHealthCheck[]> {
  const provider = getGuardrailProvider();
  if (!provider) return [];
  try {
    const result = await provider.health();
    return [{ name: provider.name, ...result }];
  } catch (error) {
    return [
      {
        name: provider.name,
        status: 'down',
        latencyMs: 0,
        lastCheckedAt: new Date().toISOString(),
        detail: error instanceof Error ? error.message : 'unknown_error',
      },
    ];
  }
}

/** Mirrors `ProviderHealth.status` shape from GuardrailProvider port (ADR-048). */
type HealthCheckStatus = 'up' | 'degraded' | 'down';

interface DependencyCheck {
  status: HealthCheckStatus;
  latencyMs: number;
  detail?: string;
}

async function probeDatabase(
  healthCheck: () => Promise<{ database: 'up' | 'down' }>,
): Promise<DependencyCheck> {
  const start = Date.now();
  try {
    const result = await healthCheck();
    return {
      status: result.database === 'up' ? 'up' : 'down',
      latencyMs: Date.now() - start,
    };
  } catch (error) {
    return {
      status: 'down',
      latencyMs: Date.now() - start,
      detail: error instanceof Error ? error.message : 'unknown_error',
    };
  }
}

/** Returns `null` when no cache or Noop — payload encodes "skipped" branch as JSON null. */
async function probeRedis(
  cacheService: CacheService | undefined,
  timeoutMs: number,
): Promise<DependencyCheck | null> {
  if (!cacheService || cacheService instanceof NoopCacheService) return null;
  const start = Date.now();
  try {
    const ok = await Promise.race<boolean>([
      cacheService.ping(),
      new Promise<boolean>((resolve) =>
        setTimeout(() => {
          resolve(false);
        }, timeoutMs),
      ),
    ]);
    return {
      status: ok ? 'up' : 'down',
      latencyMs: Date.now() - start,
    };
  } catch (error) {
    return {
      status: 'down',
      latencyMs: Date.now() - start,
      detail: error instanceof Error ? error.message : 'unknown_error',
    };
  }
}

/** any `down`→down, any `degraded`→degraded, else `up`. Empty → up (no deps = nothing unhealthy). */
function aggregateStatus(components: HealthCheckStatus[]): HealthCheckStatus {
  if (components.includes('down')) return 'down';
  if (components.includes('degraded')) return 'degraded';
  return 'up';
}

/** Returns 200 even when aggregate is degraded/down — body IS the status report. */
function createDeepHealthHandler(deps: {
  healthCheck: () => Promise<{ database: 'up' | 'down' }>;
  cacheService: CacheService | undefined;
}): (req: Request, res: Response) => Promise<void> {
  const REDIS_PING_TIMEOUT_MS = 2_000;
  return async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    const start = Date.now();

    const guardrailHealthChecks = await probeGuardrailProviders();
    const dbCheck = await probeDatabase(deps.healthCheck);
    const redisCheck = await probeRedis(deps.cacheService, REDIS_PING_TIMEOUT_MS);

    const components: HealthCheckStatus[] = [
      dbCheck.status,
      ...(redisCheck ? [redisCheck.status] : []),
      ...guardrailHealthChecks.map((c) => c.status),
    ];

    res.status(200).json({
      status: aggregateStatus(components),
      checks: {
        guardrails: guardrailHealthChecks,
        db: dbCheck,
        redis: redisCheck,
      },
      version: env.appVersion,
      commitSha: env.commitSha ?? null,
      checkedAt: new Date(start).toISOString(),
      latencyMs: Date.now() - start,
    });
  };
}

/**
 * Lazy singleton — tests injecting own chatService skip Redis connect cost; missing
 * Redis config degrades to 503 rather than crashing boot.
 * Gated by `env.extractionWorkerEnabled`: false → BullMQ adapter NEVER instantiated
 * (no ioredis client, no ECONNREFUSED floods). /museums/:id/enrichment degrades to
 * "no use case" — same fail-open path as Redis-down prod.
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
      getCompareImageUseCase(),
      getCompareSessionAccessVerifier(),
      getMessageExplanationUseCase(),
      getUpdateSessionContextUseCase(),
    ),
  );
  router.use('/auth/consent', consentRouter);
  // Ordering R16: MFA mounted BEFORE catch-all `/auth` so `/auth/mfa/*` resolves to
  // dedicated TOTP router instead of 404-ing through authRouter.
  router.use('/auth/mfa', mfaRouter);
  router.use('/auth', authRouter);
  // GDPR DSAR Art 15+20 — `GET /api/users/me/export`. Always uses `req.user.id`,
  // never a path param (anti-IDOR per security audit § 3 T2).
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
  // Stryker disable next-line StringLiteral: Express normalizes router.use('', X) to router.use('/', X) at mount time — the mount-path literal '' is therefore observationally identical to '/' for the low-data-pack root mount.
  router.use('/', createLowDataPackRouter(lowDataPackService));

  // Stryker disable StringLiteral: Express normalizes the empty string mount path to '/' but the admin sub-routers expose their own /<path> routes, making the '/admin' prefix literal unobservable from black-box supertest hits that go through the parent /api mount — both mutations leave the admin probe reachable in the test harness even though the production routing intent differs.
  router.use('/admin', adminRouter);
  // R2 W3.4 — admin CSV export (sessions / reviews / tickets).
  router.use('/admin', adminExportRouter);
  router.use('/admin', createCachePurgeRouter(resolvedCache));
  // Stryker restore StringLiteral
  const artworkKnowledgeRepo = getArtworkKnowledgeRepo();
  if (artworkKnowledgeRepo) {
    router.use('/admin', createAdminKeRouter(artworkKnowledgeRepo));
  }
  router.use('/support', supportRouter);
  router.use('/reviews', reviewRouter);
  // R4 W4.3 — B2B leads endpoint (POST /api/leads/b2b).
  router.use('/leads', leadsRouter);
}
