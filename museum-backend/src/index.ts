import './instrumentation';
import 'reflect-metadata';
import util from 'util';

import { env } from '@src/config/env';
import { AppDataSource } from '@src/data/db/data-source';
import { logger } from '@shared/logger/logger';
import { initSentry } from '@shared/observability/sentry';
import { shutdownOpenTelemetry } from '@shared/observability/opentelemetry';
import { createApp } from './app';
import { RefreshTokenRepositoryPg } from '@modules/auth/adapters/secondary/refresh-token.repository.pg';
import { TokenCleanupService } from '@modules/auth/core/useCase/tokenCleanup.service';
import { RedisCacheService } from '@shared/cache/redis-cache.service';
import { NoopCacheService } from '@shared/cache/noop-cache.service';
import type { CacheService } from '@shared/cache/cache.port';
import { getOcrService } from '@modules/chat';
import { stopRateLimitSweep } from '@src/helpers/middleware/rate-limit.middleware';
import { setRedisRateLimitStore } from '@src/helpers/middleware/rate-limit.middleware';
import { RedisRateLimitStore } from '@src/helpers/middleware/redis-rate-limit-store';
import Redis from 'ioredis';

/** Grace period for in-flight requests to complete before forced exit (ms). */
const SHUTDOWN_TIMEOUT_MS = 30_000;

/** Initializes the database, starts the HTTP server, and registers graceful shutdown handlers. */
const start = async (): Promise<void> => {
  initSentry();

  try {
    await AppDataSource.initialize();
    logger.info('database_initialized', {
      host: env.db.host,
      database: env.db.database,
    });

    let cacheService: CacheService;
    let redisClient: Redis | undefined;

    if (env.cache?.enabled) {
      const redisCacheService = new RedisCacheService({
        url: env.cache.url,
        defaultTtlSeconds: env.cache.sessionTtlSeconds,
      });
      void redisCacheService.connect().catch((err) => {
        logger.error('redis_connection_failed', { error: (err as Error).message ?? err });
      });
      cacheService = redisCacheService;

      // Create a dedicated Redis connection for rate limiting
      redisClient = new Redis(env.cache.url, {
        maxRetriesPerRequest: 1,
        lazyConnect: false,
        enableReadyCheck: false,
        connectionName: 'rate-limit',
      });
      redisClient.on('error', (err) => {
        logger.warn('redis_rate_limit_connection_error', {
          error: (err as Error).message ?? 'unknown',
        });
      });
      const redisRateLimitStore = new RedisRateLimitStore(redisClient);
      setRedisRateLimitStore(redisRateLimitStore);
      logger.info('redis_rate_limit_store_enabled');
    } else {
      cacheService = new NoopCacheService();
    }

    const app = createApp({ cacheService });
    const server = app.listen(env.port, () => {
      logger.info('server_started', {
        port: env.port,
        baseUrl: `http://localhost:${env.port}`,
      });
    });

    const tokenCleanup = new TokenCleanupService(
      new RefreshTokenRepositoryPg(),
      cacheService,
    );
    tokenCleanup.startScheduler();

    let isShuttingDown = false;

    const shutdown = async (signal: string): Promise<void> => {
      if (isShuttingDown) return;
      isShuttingDown = true;

      logger.info('server_shutdown_start', { signal, timeoutMs: SHUTDOWN_TIMEOUT_MS });

      // 1. Stop accepting new connections
      tokenCleanup.stopScheduler();
      stopRateLimitSweep();
      await shutdownOpenTelemetry();
      const ocr = getOcrService();
      if (ocr?.destroy) await ocr.destroy();

      // 2. Close the HTTP server — stops accepting new connections,
      //    waits for in-flight requests to complete
      server.close(async () => {
        logger.info('server_connections_drained');
        try {
          if (AppDataSource.isInitialized) {
            await AppDataSource.destroy();
            logger.info('database_closed');
          }
        } finally {
          // 3. Close Redis connections
          if (redisClient) {
            try {
              await redisClient.quit();
              logger.info('redis_rate_limit_closed');
            } catch {
              // Best-effort
            }
          }
          process.exit(0);
        }
      });

      // Force exit after grace period if connections don't drain in time
      setTimeout(() => {
        logger.warn('server_shutdown_forced', {
          reason: 'drain timeout exceeded',
          timeoutMs: SHUTDOWN_TIMEOUT_MS,
        });
        process.exit(1);
      }, SHUTDOWN_TIMEOUT_MS).unref();
    };

    ['SIGINT', 'SIGTERM'].forEach((sig) => {
      process.on(sig as NodeJS.Signals, () => {
        void shutdown(sig);
      });
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message || util.inspect(error)
        : util.inspect(error);
    logger.error('startup_failed', {
      error: errorMessage,
      dbHost: env.db.host,
      dbPort: env.db.port,
    });
    if (env.nodeEnv !== 'production') {
      logger.warn('startup_db_hint', {
        message:
          'Database unreachable. For docker-compose use DB_HOST=localhost and DB_PORT=5433; for local Postgres usually DB_PORT=5432.',
      });
    }
    process.exit(1);
  }
};

void start();
