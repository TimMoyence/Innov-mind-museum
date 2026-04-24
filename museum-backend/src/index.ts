import './instrumentation';
import 'reflect-metadata';
import util from 'node:util';

import { Queue } from 'bullmq';
import Redis from 'ioredis';

import { RefreshTokenRepositoryPg } from '@modules/auth/adapters/secondary/refresh-token.repository.pg';
import { TokenCleanupService } from '@modules/auth/useCase/tokenCleanup.service';
import { getOcrService, stopArtKeywordsRefresh, stopKnowledgeExtraction } from '@modules/chat';
import {
  registerChatPurgeCron,
  type ChatPurgeCronHandle,
} from '@modules/chat/jobs/chat-purge-cron.registrar';
import {
  buildPurgeDeadEnrichmentsUseCase,
  buildRefreshStaleEnrichmentsUseCase,
  createBullmqEnrichmentScheduler,
} from '@modules/museum';
import { BullmqMuseumEnrichmentQueueAdapter } from '@modules/museum/adapters/secondary/bullmq-museum-enrichment-queue.adapter';
import { registerAuditCron, type AuditCronHandle } from '@shared/audit/audit-cron.registrar';
import { NoopCacheService } from '@shared/cache/noop-cache.service';
import { RedisCacheService } from '@shared/cache/redis-cache.service';
import { logger } from '@shared/logger/logger';
import { shutdownOpenTelemetry } from '@shared/observability/opentelemetry';
import { initSentry } from '@shared/observability/sentry';
import { assertDeploymentInvariants } from '@src/config/deployment-invariants';
import { env } from '@src/config/env';
import { AppDataSource, startPoolMonitor } from '@src/data/db/data-source';
import { setDailyChatLimitCacheService } from '@src/helpers/middleware/daily-chat-limit.middleware';
import {
  stopRateLimitSweep,
  setRedisRateLimitStore,
} from '@src/helpers/middleware/rate-limit.middleware';
import { RedisRateLimitStore } from '@src/helpers/middleware/redis-rate-limit-store';

import { createApp } from './app';

import type { EnrichmentSchedulerPort } from '@modules/museum';
import type { CacheService } from '@shared/cache/cache.port';
import type { Server } from 'node:http';

/** Grace period for in-flight requests to complete before forced exit (ms). */
const SHUTDOWN_TIMEOUT_MS = 30_000;

/** Initializes cache and rate-limit Redis connections from environment config. */
function initCacheAndRateLimit(): { cacheService: CacheService; redisClient: Redis | undefined } {
  if (env.cache?.enabled) {
    const redisPassword = env.cache.password;
    const redisCacheService = new RedisCacheService({
      url: env.cache.url,
      password: redisPassword,
      defaultTtlSeconds: env.cache.sessionTtlSeconds,
    });
    void redisCacheService.connect().catch((err: unknown) => {
      logger.error('redis_connection_failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    });

    // Create a dedicated Redis connection for rate limiting
    const redisClient = new Redis(env.cache.url, {
      maxRetriesPerRequest: 1,
      lazyConnect: false,
      enableReadyCheck: false,
      connectionName: 'rate-limit',
      ...(redisPassword ? { password: redisPassword } : {}),
    });
    redisClient.on('error', (err) => {
      logger.warn('redis_rate_limit_connection_error', {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive: err.message may be undefined at runtime
        error: err.message ?? 'unknown',
      });
    });
    const redisRateLimitStore = new RedisRateLimitStore(redisClient);
    setRedisRateLimitStore(redisRateLimitStore);
    setDailyChatLimitCacheService(redisCacheService);
    logger.info('redis_rate_limit_store_enabled');

    return { cacheService: redisCacheService, redisClient };
  }

  if (env.nodeEnv === 'production') {
    logger.warn('redis_disabled_in_production', {
      message:
        'Redis is disabled in production. Rate limiting will use in-memory store (not distributed). Set CACHE_ENABLED=true and REDIS_URL for multi-instance deployments.',
    });
  }

  return { cacheService: new NoopCacheService(), redisClient: undefined };
}

/**
 * Boots the daily stale-enrichment scan scheduler. Fail-open: any error
 * (missing Redis, BullMQ init failure) is logged and the server proceeds
 * without the scheduler — on-demand enrichment keeps working.
 */
async function startEnrichmentScheduler(): Promise<EnrichmentSchedulerPort | undefined> {
  try {
    const queue = new BullmqMuseumEnrichmentQueueAdapter({
      host: env.redis.host,
      port: env.redis.port,
      password: env.redis.password,
      maxRetriesPerRequest: null,
      enableOfflineQueue: false,
    });
    const useCase = buildRefreshStaleEnrichmentsUseCase(queue);
    const purgeUseCase = buildPurgeDeadEnrichmentsUseCase();
    const scheduler = createBullmqEnrichmentScheduler(
      useCase,
      {
        connection: {
          host: env.redis.host,
          port: env.redis.port,
          password: env.redis.password,
          maxRetriesPerRequest: null,
          enableOfflineQueue: false,
        },
      },
      purgeUseCase,
      env.enrichment.hardDeleteAfterDays,
    );
    await scheduler.start();
    return scheduler;
  } catch (err) {
    logger.warn('enrichment_scheduler_boot_skipped', {
      error: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}

/** BullMQ queue name used exclusively by the audit IP anonymization cron. */
const AUDIT_CRON_QUEUE_NAME = 'audit-cron';

/**
 * Boots the daily audit IP anonymization scheduler on a dedicated queue.
 * Fail-open: any error (missing Redis, BullMQ init failure) is logged and
 * the server proceeds without the cron.
 */
async function startAuditCron(): Promise<{
  handle: AuditCronHandle | undefined;
  queue: Queue | undefined;
}> {
  try {
    const connection = {
      host: env.redis.host,
      port: env.redis.port,
      password: env.redis.password,
      maxRetriesPerRequest: null,
      enableOfflineQueue: false,
    } as const;
    const queue = new Queue(AUDIT_CRON_QUEUE_NAME, {
      connection,
      defaultJobOptions: { removeOnComplete: 50, removeOnFail: 100 },
    });
    const handle = await registerAuditCron(queue, AppDataSource, { connection });
    return { handle, queue };
  } catch (err) {
    logger.warn('audit_cron_boot_skipped', {
      error: err instanceof Error ? err.message : String(err),
    });
    return { handle: undefined, queue: undefined };
  }
}

/** Grouped lifecycle resources wired at boot and drained on shutdown. */
interface ShutdownResources {
  server: Server;
  tokenCleanup: TokenCleanupService;
  redisClient: Redis | undefined;
  cacheService: CacheService;
  poolMonitor: NodeJS.Timeout;
  enrichmentScheduler: EnrichmentSchedulerPort | undefined;
  auditCron: AuditCronHandle | undefined;
  auditCronQueue: Queue | undefined;
  chatPurgeCron: ChatPurgeCronHandle | undefined;
}

/** Runs an async teardown step, logging any error under the given key without rethrowing. */
async function safeTeardown(
  label: string,
  step: () => Promise<void> | void | undefined,
): Promise<void> {
  try {
    await step();
  } catch (err) {
    logger.warn(label, {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Stops all synchronous schedulers and the dedicated in-process sweeps. */
function stopSynchronousSchedulers(
  tokenCleanup: TokenCleanupService,
  poolMonitor: NodeJS.Timeout,
): void {
  tokenCleanup.stopScheduler();
  clearInterval(poolMonitor);
  stopRateLimitSweep();
  stopArtKeywordsRefresh();
}

/** Stops all BullMQ crons + queues + OpenTelemetry + caches, logging each failure independently. */
async function drainAsyncResources(resources: ShutdownResources): Promise<void> {
  const { enrichmentScheduler, auditCron, auditCronQueue, chatPurgeCron, cacheService } = resources;

  await safeTeardown('knowledge_extraction_shutdown_error', () => stopKnowledgeExtraction());
  if (enrichmentScheduler) {
    await safeTeardown('enrichment_scheduler_shutdown_error', () => enrichmentScheduler.stop());
  }
  if (auditCron) {
    await safeTeardown('audit_cron_shutdown_error', () => auditCron.stop());
  }
  if (auditCronQueue) {
    await safeTeardown('audit_cron_queue_close_failed', () => auditCronQueue.close());
  }
  if (chatPurgeCron) {
    await safeTeardown('chat_purge_cron_shutdown_error', () => chatPurgeCron.stop());
  }
  await shutdownOpenTelemetry();
  const ocr = getOcrService();
  if (ocr.destroy) await ocr.destroy();
  if (cacheService.destroy) await cacheService.destroy();
}

/** Closes DB + Redis after in-flight HTTP requests drained, then exits with code 0. */
async function finalizeShutdown(redisClient: Redis | undefined): Promise<void> {
  try {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
      logger.info('database_closed');
    }
  } finally {
    if (redisClient) {
      await safeTeardown('redis_rate_limit_close_failed', async () => {
        await redisClient.quit();
      });
      logger.info('redis_rate_limit_closed');
    }
    process.exit(0);
  }
}

/** Registers SIGINT/SIGTERM handlers that drain connections and clean up resources. */
function registerShutdownHandlers(resources: ShutdownResources): void {
  const { server, tokenCleanup, redisClient, poolMonitor } = resources;
  let isShuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info('server_shutdown_start', { signal, timeoutMs: SHUTDOWN_TIMEOUT_MS });

    stopSynchronousSchedulers(tokenCleanup, poolMonitor);
    await drainAsyncResources(resources);

    server.close(() => {
      logger.info('server_connections_drained');
      void finalizeShutdown(redisClient);
    });

    setTimeout(() => {
      logger.warn('server_shutdown_forced', {
        reason: 'drain timeout exceeded',
        timeoutMs: SHUTDOWN_TIMEOUT_MS,
      });
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS).unref();
  };

  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig as NodeJS.Signals, () => {
      void shutdown(sig);
    });
  }
}

/** Boots the chat-purge cron (Redis-enabled only). Fail-open on any registrar error. */
async function startChatPurgeCron(): Promise<ChatPurgeCronHandle | undefined> {
  if (!env.cache?.enabled) return undefined;
  try {
    return await registerChatPurgeCron(AppDataSource, {
      connection: {
        host: env.redis.host,
        port: env.redis.port,
        password: env.redis.password,
        maxRetriesPerRequest: null,
        enableOfflineQueue: false,
      },
      retentionDays: env.chatPurgeRetentionDays,
    });
  } catch (err) {
    logger.warn('chat_purge_cron_boot_skipped', {
      error: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}

/** Wires schedulers + cron jobs around the freshly-initialized cache/DB. Pure orchestration. */
async function bootBackgroundJobs(
  cacheService: CacheService,
): Promise<Omit<ShutdownResources, 'server' | 'redisClient' | 'cacheService'>> {
  const tokenCleanup = new TokenCleanupService(
    new RefreshTokenRepositoryPg(AppDataSource),
    cacheService,
  );
  tokenCleanup.startScheduler();

  const poolMonitor = startPoolMonitor();
  const enrichmentScheduler = await startEnrichmentScheduler();
  const { handle: auditCron, queue: auditCronQueue } = env.cache?.enabled
    ? await startAuditCron()
    : { handle: undefined, queue: undefined };
  const chatPurgeCron = await startChatPurgeCron();

  return {
    tokenCleanup,
    poolMonitor,
    enrichmentScheduler,
    auditCron,
    auditCronQueue,
    chatPurgeCron,
  };
}

/** Logs a startup failure with the most informative message available and an env hint in non-prod. */
function logStartupFailure(error: unknown): void {
  const errorMessage =
    error instanceof Error ? error.message || util.inspect(error) : util.inspect(error);
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
}

/** Initializes the database, starts the HTTP server, and registers graceful shutdown handlers. */
const start = async (): Promise<void> => {
  initSentry();

  // Fail fast on unsafe deployment topology (multi-instance + no shared Redis in prod).
  // Must run BEFORE any external connection so the pod fails its readiness probe.
  assertDeploymentInvariants(env, { logger });

  try {
    await AppDataSource.initialize();
    logger.info('database_initialized', {
      host: env.db.host,
      database: env.db.database,
    });

    const { cacheService, redisClient } = initCacheAndRateLimit();

    const app = createApp({ cacheService });
    const server = app.listen(env.port, () => {
      logger.info('server_started', {
        port: env.port,
        baseUrl: `http://localhost:${String(env.port)}`,
      });
    });

    const jobs = await bootBackgroundJobs(cacheService);

    registerShutdownHandlers({
      server,
      redisClient,
      cacheService,
      ...jobs,
    });
  } catch (error) {
    logStartupFailure(error);
    process.exit(1);
  }
};

void start();
