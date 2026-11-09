import compression from 'compression';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';

import { AppDataSource } from '@data/db/data-source';
import { buildChatService } from '@modules/chat';
import { setActiveChatModule } from '@modules/chat/chat-module';
import { museumRepository } from '@modules/museum';
import { MemoryCacheService } from '@shared/cache/memory-cache.service';
import { RedisCacheService } from '@shared/cache/redis-cache.service';
import { ResilientCacheWrapper } from '@shared/cache/resilient-cache.wrapper';
import { errorMessage } from '@shared/errors/error-message';
import { resolveCorsOrigin } from '@shared/http/cors.config';
import { setupSwagger } from '@shared/http/swagger';
import { logger } from '@shared/logger/logger';
import { acceptLanguageMiddleware } from '@shared/middleware/accept-language.middleware';
import { cookieParserMiddleware } from '@shared/middleware/cookie-parser.middleware';
import { csrfMiddleware } from '@shared/middleware/csrf.middleware';
import { dataModeMiddleware } from '@shared/middleware/dataMode.middleware';
import { errorHandler } from '@shared/middleware/error.middleware';
import { byIp, createRateLimitMiddleware } from '@shared/middleware/rate-limit.middleware';
import * as requestDecompression from '@shared/middleware/request-decompression.middleware';
import { requestIdMiddleware } from '@shared/middleware/request-id.middleware';
import { requestLoggerMiddleware } from '@shared/middleware/request-logger.middleware';
import { resetFailureCounters } from '@shared/net-shaping/failure-counter.store';
import { createNetProfileFaultMiddleware } from '@shared/net-shaping/net-profile-fault.middleware';
import { setupSentryExpressErrorHandler } from '@shared/observability/sentry';
import { tracePropagationMiddleware } from '@shared/observability/trace-propagation.middleware';
import { createApiRouter } from '@shared/routers/api.router';
import { env } from '@src/config/env';
import { shouldMountNetFault } from '@src/config/net-fault.config';

import type { ChatModule } from '@modules/chat/chat-module';
import type { CacheService } from '@shared/cache/cache.port';

interface CreateAppOptions {
  chatService?: ReturnType<typeof buildChatService>;
  chatModule?: ChatModule;
  healthCheck?: () => Promise<{ database: 'up' | 'down' }>;
  cacheService?: CacheService;
}

const isProd = env.nodeEnv === 'production';

const NET_FAULT_CORS_HEADERS = [
  'X-Net-Profile',
  'X-Net-Fail-Count',
  'X-Net-Fail-Mode',
  'X-Net-Pace',
] as const;

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

function buildHelmetOptions(isProduction: boolean): Parameters<typeof helmet>[0] {
  if (!isProduction) {
    return { contentSecurityPolicy: false as const, hsts: false as const };
  }
  return {
    hsts: { maxAge: 63_072_000, includeSubDomains: true, preload: true },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
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

function maybeMountNetFaultInjector(app: Express): void {
  if (shouldMountNetFault(process.env.NET_FAULT_INJECTION_ENABLED, env.nodeEnv)) {
    logger.warn('net_fault_injection_mounted', {
      reason: 'NET_FAULT_INJECTION_ENABLED is truthy in a non-production environment',
      nodeEnv: env.nodeEnv,
    });
    app.use(
      createNetProfileFaultMiddleware({
        logDebug: (event, context) => {
          logger.info(event, context);
        },
      }),
    );
    app.post('/api/__test__/net-fault/reset', (_req, res) => {
      resetFailureCounters();
      res.status(204).end();
    });
  }
}

function applyGlobalMiddleware(app: Express): void {
  app.set('trust proxy', env.trustProxy ? 1 : 0);

  app.use(requestIdMiddleware);
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
        'Idempotency-Key',
        'Content-Encoding',
        'Accept-Language',
        'sentry-trace',
        'baggage',
        ...NET_FAULT_CORS_HEADERS,
      ],
    }),
  );

  app.use(
    createRateLimitMiddleware({
      limit: env.rateLimit.ipLimit,
      windowMs: env.rateLimit.windowMs,
      keyGenerator: byIp,
      countRejected: true,
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

  maybeMountNetFaultInjector(app);

  app.use((_req, res, next) => {
    res.setTimeout(env.requestTimeoutMs);
    next();
  });

  app.use(requestDecompression.requestDecompressionMiddleware);

  app.use(express.json({ limit: env.jsonBodyLimit }));
  app.use(express.urlencoded({ extended: true, limit: env.jsonBodyLimit }));
  app.use(cookieParserMiddleware);
  app.use(csrfMiddleware);
  app.use(acceptLanguageMiddleware);
  app.use(dataModeMiddleware);

  app.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
}

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
        error: errorMessage(err),
      });
    });
    return new ResilientCacheWrapper(redisCacheService);
  }

  logger.info('cache_memory_fallback', {
    reason: 'CACHE_ENABLED=false — using in-memory cache (Overpass, LLM, etc.)',
  });
  return new ResilientCacheWrapper(new MemoryCacheService());
}

export const createApp = (options: CreateAppOptions = {}): Express => {
  const app = express();

  if (options.chatModule) {
    setActiveChatModule(options.chatModule);
  }

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
