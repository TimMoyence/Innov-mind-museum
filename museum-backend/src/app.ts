import compression from 'compression';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';

import { wireAuthMiddleware } from '@modules/auth';
import { buildChatService } from '@modules/chat';
import { setActiveChatModule } from '@modules/chat/chat-module-singleton';
import { museumRepository } from '@modules/museum';
import { MemoryCacheService } from '@shared/cache/memory-cache.service';
import { RedisCacheService } from '@shared/cache/redis-cache.service';
import { logger } from '@shared/logger/logger';
import { setupSentryExpressErrorHandler } from '@shared/observability/sentry';
import { createApiRouter } from '@shared/routers/api.router';
import { env } from '@src/config/env';
import { AppDataSource } from '@src/data/db/data-source';
import { resolveCorsOrigin } from '@src/helpers/cors.config';
import { dataModeMiddleware } from '@src/helpers/dataMode.middleware';
import { acceptLanguageMiddleware } from '@src/helpers/middleware/accept-language.middleware';
import { errorHandler } from '@src/helpers/middleware/error.middleware';
import { byIp, createRateLimitMiddleware } from '@src/helpers/middleware/rate-limit.middleware';
import { requestIdMiddleware } from '@src/helpers/middleware/request-id.middleware';
import { requestLoggerMiddleware } from '@src/helpers/middleware/request-logger.middleware';
import { setupSwagger } from '@src/helpers/swagger';

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

/** Registers security, compression, timeout, and parsing middleware on the Express app. */
function applyGlobalMiddleware(app: Express): void {
  app.set('trust proxy', env.trustProxy ? 1 : 0);

  app.use(requestIdMiddleware);
  app.use(requestLoggerMiddleware);

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

  const helmetOpts = isProd
    ? { hsts: { maxAge: 31536000, includeSubDomains: true } }
    : { contentSecurityPolicy: false as const, hsts: false as const };
  app.use(helmet(helmetOpts));
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

  app.use(express.json({ limit: env.jsonBodyLimit }));
  app.use(express.urlencoded({ extended: true, limit: env.jsonBodyLimit }));
  app.use(acceptLanguageMiddleware);
  app.use(dataModeMiddleware);

  // Default Cache-Control: prevent CDN/proxy caching of dynamic API responses
  app.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
}

/** Resolves the cache service from options or environment configuration. */
function resolveCacheService(options: CreateAppOptions): CacheService {
  if (options.cacheService) {
    return options.cacheService;
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
    return redisCacheService;
  }

  logger.info('cache_memory_fallback', {
    reason: 'CACHE_ENABLED=false — using in-memory cache (Overpass, LLM, etc.)',
  });
  return new MemoryCacheService();
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
