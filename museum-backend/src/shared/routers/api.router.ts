import { Router } from 'express';

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
  getUserMemoryService,
} from '@modules/chat/chat-module';
import { createDailyArtRouter } from '@modules/daily-art';
import { buildEnrichMuseumUseCase, buildLowDataPackService } from '@modules/museum';
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

/** Dependencies required to build the top-level API router. */
interface ApiRouterDeps {
  chatService: ChatService;
  healthCheck: () => Promise<{ database: 'up' | 'down' }>;
  cacheService?: CacheService;
}

/** Shared circuit-breaker state shape, surfaced for both LLM provider + LLM Guard sidecar. */
type CircuitBreakerHealthState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/** Shape of the JSON response returned by the GET /api/health endpoint. */
export interface HealthPayload {
  status: 'ok' | 'degraded';
  checks: {
    database: 'up' | 'down';
    llmConfigured?: boolean;
    redis?: 'up' | 'down' | 'skipped';
    llmCircuitBreaker?: CircuitBreakerHealthState;
    /**
     * LLM Guard sidecar circuit breaker state. Additive 2026-05-12 ; same
     * redaction posture as `llmCircuitBreaker` — only surfaced in
     * non-production responses.
     */
    llmGuard?: CircuitBreakerHealthState;
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
 * @param params.checks.llmGuard - Optional LLM Guard sidecar circuit breaker state.
 * @param params.llmConfigured - Whether at least one LLM provider is configured.
 * @param params.nodeEnv - Optional environment override for testing; defaults to `env.nodeEnv`.
 * @returns Structured health payload with version and timestamp.
 */
export const buildHealthPayload = (params: {
  checks: {
    database: 'up' | 'down';
    redis?: 'up' | 'down' | 'skipped';
    llmCircuitBreaker?: CircuitBreakerHealthState;
    llmGuard?: CircuitBreakerHealthState;
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

    if (params.checks.llmGuard !== undefined) {
      payload.checks.llmGuard = params.checks.llmGuard;
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
    // SEC-HARDENING (L4): responseTimeMs is a minor side-channel — only
    // expose it outside production.
    if (env.nodeEnv !== 'production') {
      payload.responseTimeMs = responseTimeMs;
    }

    const httpStatus = dbChecks.database === 'down' ? 503 : 200;
    res.status(httpStatus).json(payload);
  });

  // 2026-05-13 — Phase 1 perennial design: semantic deep-health probe. Unlike
  // `/health`, this endpoint exercises the actual decision paths of each
  // dependency (sidecar /scan, DB SELECT, Redis PING) and aggregates a
  // qualitative verdict. Distinct from TCP-up: a sidecar that accepts
  // connections but blocks every probe registers as `degraded`, not `up`.
  // Returns 200 even on degraded/down — the body is the status report, not
  // a gate. Future K8s-style readiness can hook the JSON.
  router.get('/health/deep', createDeepHealthHandler({ healthCheck, cacheService }));

  mountDomainRouters(router, chatService, cacheService);

  return router;
};

/**
 * Shape of one guardrail provider probe in `/api/health/deep`. Mirrors the
 * `ProviderHealth` port type plus the provider's `name` so a multi-adapter
 * stack (Phase 2) renders as an array of named verdicts.
 */
interface GuardrailHealthCheck extends ProviderHealth {
  name: string;
}

/**
 * Probes every registered `GuardrailProvider` via its `health()` method.
 * Wraps each call in a try/catch so a single faulty adapter cannot crash
 * the deep-health response. The adapter itself promises `never throws` per
 * the port contract — this is defence-in-depth.
 *
 * V1 has one adapter (`llm-guard`) when configured; the array shape is
 * forward-compatible with the Phase 2 multi-provider aggregator (ADR-048).
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

/**
 * Qualitative health verdict shared by every dependency probe in `/health/deep`.
 * Mirrors the `ProviderHealth.status` shape from the `GuardrailProvider` port
 * (ADR-048) so the aggregator can rank a heterogeneous probe set uniformly.
 */
type HealthCheckStatus = 'up' | 'degraded' | 'down';

interface DependencyCheck {
  status: HealthCheckStatus;
  latencyMs: number;
  detail?: string;
}

/** Probes the DB via the injected `healthCheck` callback + measures latency. */
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

/**
 * Probes Redis via the cache port's `ping()` method. Returns `null` when no
 * cache service is configured (or it's a Noop), letting the response payload
 * encode the "redis skipped" branch as a JSON `null` rather than a synthetic
 * up/down verdict.
 */
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

/**
 * Aggregates the per-component verdicts into a single top-level status:
 *   - any `down`     → `down`
 *   - any `degraded` → `degraded`
 *   - otherwise      → `up`
 *
 * Empty input collapses to `up` (no dependencies configured = nothing
 * unhealthy). Pure — no I/O.
 */
function aggregateStatus(components: HealthCheckStatus[]): HealthCheckStatus {
  if (components.includes('down')) return 'down';
  if (components.includes('degraded')) return 'degraded';
  return 'up';
}

/**
 * Express handler factory for `GET /api/health/deep`. Kept as a top-level helper
 * (rather than inline in `createApiRouter`) so the createApiRouter arrow stays
 * within the `max-lines-per-function` lint budget AND the handler itself can be
 * unit-tested with fake `healthCheck` + `cacheService` injections.
 *
 * Returns 200 even when aggregate is `degraded` or `down` — the body IS the
 * status report; downstream readiness/liveness gates can inspect the JSON.
 */
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
      getCompareImageUseCase(),
      getCompareSessionAccessVerifier(),
      getMessageExplanationUseCase(),
    ),
  );
  router.use('/auth/consent', consentRouter);
  // R16 — MFA endpoints mounted before the catch-all auth router so the
  // `/auth/mfa/*` paths resolve to the dedicated TOTP router instead of
  // 404-ing through `authRouter`.
  router.use('/auth/mfa', mfaRouter);
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
  // Stryker disable next-line StringLiteral: Express normalizes router.use('', X) to router.use('/', X) at mount time — the mount-path literal '' is therefore observationally identical to '/' for the low-data-pack root mount.
  router.use('/', createLowDataPackRouter(lowDataPackService));

  // Stryker disable StringLiteral: Express normalizes the empty string mount path to '/' but the admin sub-routers expose their own /<path> routes, making the '/admin' prefix literal unobservable from black-box supertest hits that go through the parent /api mount — both mutations leave the admin probe reachable in the test harness even though the production routing intent differs.
  router.use('/admin', adminRouter);
  router.use('/admin', createCachePurgeRouter(resolvedCache));
  // Stryker restore StringLiteral
  const artworkKnowledgeRepo = getArtworkKnowledgeRepo();
  if (artworkKnowledgeRepo) {
    router.use('/admin', createAdminKeRouter(artworkKnowledgeRepo));
  }
  router.use('/support', supportRouter);
  router.use('/reviews', reviewRouter);
}
