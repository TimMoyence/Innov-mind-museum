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
    if (env.cache?.enabled) {
      const redis = new RedisCacheService({
        url: env.cache.url,
        defaultTtlSeconds: env.cache.sessionTtlSeconds,
      });
      void redis.connect().catch((err) => {
        logger.error('redis_connection_failed', { error: (err as Error).message ?? err });
      });
      cacheService = redis;
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

    const shutdown = async (signal: string): Promise<void> => {
      logger.info('server_shutdown_start', { signal });
      tokenCleanup.stopScheduler();
      stopRateLimitSweep();
      await shutdownOpenTelemetry();
      const ocr = getOcrService();
      if (ocr?.destroy) await ocr.destroy();
      server.close(async () => {
        try {
          if (AppDataSource.isInitialized) {
            await AppDataSource.destroy();
          }
        } finally {
          process.exit(0);
        }
      });

      setTimeout(() => process.exit(1), 10000).unref();
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
