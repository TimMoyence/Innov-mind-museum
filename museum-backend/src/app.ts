import compression from 'compression';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';

import { AppDataSource } from '@data/db/data-source';
import { wireAuthMiddleware } from '@modules/auth';
import { UserRole } from '@modules/auth/domain/user/user-role';
import { buildChatService } from '@modules/chat';
import { setActiveChatModule } from '@modules/chat/chat-module';
import { museumRepository } from '@modules/museum';
import { MemoryCacheService } from '@shared/cache/memory-cache.service';
import { RedisCacheService } from '@shared/cache/redis-cache.service';
import { ResilientCacheWrapper } from '@shared/cache/resilient-cache.wrapper';
import { resolveCorsOrigin } from '@shared/http/cors.config';
import { setupSwagger } from '@shared/http/swagger';
import { logger } from '@shared/logger/logger';
import { acceptLanguageMiddleware } from '@shared/middleware/accept-language.middleware';
import { isAuthenticated } from '@shared/middleware/authenticated.middleware';
import { cookieParserMiddleware } from '@shared/middleware/cookie-parser.middleware';
import { csrfMiddleware } from '@shared/middleware/csrf.middleware';
import { dataModeMiddleware } from '@shared/middleware/dataMode.middleware';
import { errorHandler } from '@shared/middleware/error.middleware';
import { byIp, createRateLimitMiddleware } from '@shared/middleware/rate-limit.middleware';
// Namespace import (see mount site below): keeps the middleware token out of
// this import block so structural ordering checks resolve it at its mount
// position. lib-docs/express/PATTERNS.md §3.3 (middleware ordering).
import * as requestDecompression from '@shared/middleware/request-decompression.middleware';
import { requestIdMiddleware } from '@shared/middleware/request-id.middleware';
import { requestLoggerMiddleware } from '@shared/middleware/request-logger.middleware';
import { requireRole } from '@shared/middleware/require-role.middleware';
import { httpMetricsMiddleware, metricsHandler } from '@shared/observability/metrics-middleware';
import { enableDefaultMetrics } from '@shared/observability/prometheus-metrics';
import { setupSentryExpressErrorHandler } from '@shared/observability/sentry';
import { tracePropagationMiddleware } from '@shared/observability/trace-propagation.middleware';
import { createApiRouter } from '@shared/routers/api.router';
import { env } from '@src/config/env';

import type { ChatModule } from '@modules/chat/chat-module';
import type { CacheService } from '@shared/cache/cache.port';

/** Optional overrides for dependency injection, primarily used in tests. */
interface CreateAppOptions {
  chatService?: ReturnType<typeof buildChatService>;
  /**
   * When set, replaces the active chat module accessed by `wiring.ts` getters
   * (used by auth proxies for image cleanup + GDPR export). Lets tests verify
   * paths that cross the auth/chat boundary without mocking the entire auth
   * module factory.
   */
  chatModule?: ChatModule;
  healthCheck?: () => Promise<{ database: 'up' | 'down' }>;
  cacheService?: CacheService;
}

const isProd = env.nodeEnv === 'production';

const createHealthCheck = async (): Promise<{ database: 'up' | 'down' }> => {
  if (!AppDataSource.isInitialized) {
    return { database: 'down' };
  }

  try {
    await AppDataSource.query('SELECT 1');
    return { database: 'up' };
  } catch {
    return { database: 'down' };
  }
};

/**
 * F5 (2026-04-30) — explicit CSP + HSTS preload in production. Helmet's defaults
 * are reasonable but we lock down for upcoming admin HTML surfaces and submit to
 * the HSTS preload list (max-age=2y + preload directive). Dev / test keep helmet
 * mostly off so http://localhost works and inline tooling (Sentry replay, etc.)
 * doesn't get blocked during local debugging.
 */
function buildHelmetOptions(isProduction: boolean): Parameters<typeof helmet>[0] {
  if (!isProduction) {
    return { contentSecurityPolicy: false as const, hsts: false as const };
  }
  return {
    hsts: { maxAge: 63_072_000, includeSubDomains: true, preload: true },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // No 'unsafe-inline' — admin HTML must use nonces or CSS modules.
        scriptSrc: ["'self'"],
        // 'unsafe-inline' kept for style-src as a stop-gap; remove once admin
        // CSS migrates off inline tag styles (Phase 2 follow-up).
        styleSrc: ["'self'", "'unsafe-inline'"],
        // TD-HEL-03 — extend imgSrc allowlist : CloudFront (deferred V1.1 CDN),
        // musaium.com canonical + subdomains, Wikimedia upload (artwork
        // thumbnails sourced from `museum-backend/src/modules/daily-art/
        // artworks.data.ts`). S3 entries kept for direct presigned URLs.
        imgSrc: [
          "'self'",
          'data:',
          'https://*.s3.amazonaws.com',
          'https://*.amazonaws.com',
          'https://*.cloudfront.net',
          'https://musaium.com',
          'https://*.musaium.com',
          'https://upload.wikimedia.org',
        ],
        // TD-HEL-02 — extend connectSrc so the admin SPA Sentry browser SDK +
        // OpenAI direct browser calls (future admin "test prompt" page) +
        // Stripe (V1.1 billing) can reach their origins. Without these the
        // Sentry replay+error transport gets CSP-blocked silently in prod
        // (BLOCKER pre-V1 once admin HTML ships).
        connectSrc: [
          "'self'",
          'https://*.sentry.io',
          'https://o*.ingest.sentry.io',
          'https://api.openai.com',
          'https://api.stripe.com',
        ],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        upgradeInsecureRequests: [],
      },
    },
  };
}

/** Registers security, compression, timeout, and parsing middleware on the Express app. */
function applyGlobalMiddleware(app: Express): void {
  app.set('trust proxy', env.trustProxy ? 1 : 0);

  app.use(requestIdMiddleware);
  // TD-HEL-01 — helmet mounted EARLY so 429 / 500 / preflight responses ship
  // with CSP / HSTS / X-Content-Type-Options / X-Frame-Options. Previously
  // mounted after rateLimit → 429 leaked plaintext bodies sans headers
  // (BLOCKER pre-V1). PATTERNS.md helmet §1.
  app.use(helmet(buildHelmetOptions(isProd)));
  app.use(requestLoggerMiddleware);
  app.use(tracePropagationMiddleware);

  const corsOrigins = resolveCorsOrigin(env.corsOrigins, isProd);

  app.use(
    cors({
      origin: corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Request-Id',
        'X-Data-Mode',
        // D2 — offline-flush / reconnect dedup. The FE attaches the queued
        // item id as `Idempotency-Key`; preflight must allowlist it.
        'Idempotency-Key',
        // W1-GZIP — weak-network FE gzips large JSON request bodies; preflight
        // must allowlist Content-Encoding so the browser/RN sends it.
        'Content-Encoding',
        'Accept-Language',
        'sentry-trace',
        'baggage',
      ],
    }),
  );

  app.use(
    createRateLimitMiddleware({
      limit: env.rateLimit.ipLimit,
      windowMs: env.rateLimit.windowMs,
      keyGenerator: byIp,
    }),
  );
  app.use(
    compression({
      filter: (req, res) => {
        if (req.headers.accept === 'text/event-stream') return false;
        return compression.filter(req, res);
      },
    }),
  );

  app.use((_req, res, next) => {
    res.setTimeout(env.requestTimeoutMs);
    next();
  });

  // W1-GZIP — request-body decompression (PROD-SAFE). Inflates gzip/deflate/br
  // request bodies (weak-network FE) BEFORE express.json parses them, with a
  // streaming zip-bomb cap = bytes(env.jsonBodyLimit). MUST mount after
  // compression()/setTimeout and STRICTLY before express.json so the parser
  // reads the inflated bytes. lib-docs/express/PATTERNS.md §3.3 (ordering).
  app.use(requestDecompression.requestDecompressionMiddleware);

  app.use(express.json({ limit: env.jsonBodyLimit }));
  app.use(express.urlencoded({ extended: true, limit: env.jsonBodyLimit }));
  // F7 (2026-04-30) — populate `req.cookies` BEFORE auth + CSRF run so they
  // can read the access_token / csrf_token / refresh_token cookies.
  app.use(cookieParserMiddleware);
  // F7 — CSRF middleware. Skips GET/HEAD/OPTIONS and any request without an
  // access_token cookie (Bearer/mobile path is exempt). Mounted globally so
  // every state-changing route inherits protection without per-route wiring.
  app.use(csrfMiddleware);
  app.use(acceptLanguageMiddleware);
  app.use(dataModeMiddleware);

  // Default Cache-Control: prevent CDN/proxy caching of dynamic API responses
  app.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
}

/**
 * Resolves the cache service from options or environment configuration.
 * The result is always wrapped in {@link ResilientCacheWrapper} so backend
 * failures (Redis unreachable, malformed payload, etc.) degrade to cache-miss
 * semantics instead of bubbling up as 500s. Banking-grade contract enforced
 * by the chaos-redis-down e2e suite.
 */
function resolveCacheService(options: CreateAppOptions): CacheService {
  if (options.cacheService) {
    return new ResilientCacheWrapper(options.cacheService);
  }

  if (env.cache?.enabled) {
    const redisCacheService = new RedisCacheService({
      url: env.cache.url,
      defaultTtlSeconds: env.cache.sessionTtlSeconds,
    });
    void redisCacheService.connect().catch((err: unknown) => {
      logger.error('redis_connection_failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    });
    return new ResilientCacheWrapper(redisCacheService);
  }

  logger.info('cache_memory_fallback', {
    reason: 'CACHE_ENABLED=false — using in-memory cache (Overpass, LLM, etc.)',
  });
  return new ResilientCacheWrapper(new MemoryCacheService());
}

/**
 * Creates and configures the Express application with all middleware, routers, and error handling.
 *
 * @param options - Optional dependency overrides for testing.
 * @returns Fully configured Express application.
 */
export const createApp = (options: CreateAppOptions = {}): Express => {
  const app = express();

  if (options.chatModule) {
    setActiveChatModule(options.chatModule);
  }

  wireAuthMiddleware();

  applyGlobalMiddleware(app);

  // H (2026-05-01) — Prometheus scrape endpoint + per-request RED metrics.
  // Mounted after global middleware (auth, rate-limit, etc.) so the /metrics
  // route inherits CORS and security headers, but BEFORE API routes so every
  // subsequent handler is observed by httpMetricsMiddleware.
  // enableDefaultMetrics() spins up prom-client's process-level collectors
  // (CPU, memory, event-loop lag, FDs) — wired here, not at module load,
  // because those collectors register setIntervals that don't `.unref()` and
  // would keep Node alive past Stryker mutant runs (kills hot-reload throughput).
  enableDefaultMetrics();
  app.use(httpMetricsMiddleware);
  // TD-PC-02 — /metrics is super-admin gated (HANDOFF §7.5 Option (b)).
  // Public scrape would leak internal label cardinality + breaker state +
  // tenant_id + custom labels. Bearer JWT or `access_token` cookie required,
  // role must be SUPER_ADMIN. Cache-Control `no-store` so any CDN that ever
  // fronts the app never serves a stale Prom snapshot.
  app.get(
    '/metrics',
    (_req, res, next) => {
      res.setHeader('Cache-Control', 'private, no-store');
      next();
    },
    isAuthenticated,
    requireRole(UserRole.SUPER_ADMIN),
    metricsHandler,
  );

  if (!isProd) {
    setupSwagger(app);
  }

  const cacheService = resolveCacheService(options);
  const chatService =
    options.chatService ?? buildChatService(AppDataSource, cacheService, museumRepository);
  const healthCheck = options.healthCheck ?? createHealthCheck;

  app.use('/api', createApiRouter({ chatService, healthCheck, cacheService }));

  setupSentryExpressErrorHandler(app);
  app.use(errorHandler);

  return app;
};
