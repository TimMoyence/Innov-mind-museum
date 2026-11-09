import './instrumentation';
import 'reflect-metadata';
import util from 'node:util';

import { Queue } from 'bullmq';
import Redis from 'ioredis';

import { AppDataSource, startPoolMonitor } from '@data/db/data-source';
import { RefreshTokenRepositoryPg } from '@modules/auth/adapters/secondary/pg/refresh-token.repository.pg';
import { RedisAccessTokenDenylist } from '@modules/auth/adapters/secondary/redis/redis-access-token-denylist';
import {
  RedisNonceStore,
  setSocialNonceStore,
} from '@modules/auth/adapters/secondary/social/nonce-store';
import { authSessionService } from '@modules/auth/useCase';
import { TokenCleanupService } from '@modules/auth/useCase/session/tokenCleanup.service';
import {
  getOcrService,
  stopArtKeywordsRefresh,
  stopKnowledgeExtraction,
  stopWikidataBreaker,
} from '@modules/chat';
import { shutdownEmbeddingsAdapter } from '@modules/chat/adapters/secondary/embeddings/embeddings.factory';
import { registerArtKeywordsRetentionCron } from '@modules/chat/jobs/art-keywords-retention-cron.registrar';
import {
  registerChatPurgeCron,
  type ChatPurgeCronHandle,
} from '@modules/chat/jobs/chat-purge-cron.registrar';
import {
  registerS3OrphanPurgeCron,
  type S3OrphanPurgeCronHandle,
} from '@modules/chat/jobs/s3-orphan-purge-cron.registrar';
import { LeadRepositoryPg } from '@modules/leads/adapters/secondary/pg/lead.repository.pg';
import { registerLeadsRedeliveryCron } from '@modules/leads/jobs/leads-redelivery-cron.registrar';
import {
  buildMuseumEnrichmentWorker,
  buildPurgeDeadEnrichmentsUseCase,
  buildRefreshStaleEnrichmentsUseCase,
  createBullmqEnrichmentScheduler,
} from '@modules/museum';
import { BullmqMuseumEnrichmentQueueAdapter } from '@modules/museum/adapters/secondary/enrichment/bullmq-museum-enrichment-queue.adapter';
import { registerReviewRetentionCron } from '@modules/review/jobs/review-retention-cron.registrar';
import { registerSupportRetentionCron } from '@modules/support/jobs/support-retention-cron.registrar';
import { registerAuditCron, type AuditCronHandle } from '@shared/audit/audit-cron.registrar';
import { NoopCacheService } from '@shared/cache/noop-cache.service';
import { RedisCacheService } from '@shared/cache/redis-cache.service';
import { errorMessage } from '@shared/errors/error-message';
import { RedisLlmCostCounter } from '@shared/llm-cost-guard/redis-llm-cost-counter';
import { logger } from '@shared/logger/logger';
import { setAccessTokenDenylist } from '@shared/middleware/authenticated.middleware';
import { setLlmCostCounter } from '@shared/middleware/llm-cost-guard.middleware';
import { setMonthlyQuotaRepo } from '@shared/middleware/monthly-session-quota.middleware';
import { PgMonthlyQuotaRepo } from '@shared/middleware/monthly-session-quota.repo.pg';
import {
  stopRateLimitSweep,
  setRedisRateLimitStore,
} from '@shared/middleware/rate-limit.middleware';
import { RedisRateLimitStore } from '@shared/middleware/redis-rate-limit-store';
import { shutdownOpenTelemetry } from '@shared/observability/opentelemetry';
import { safeClose, type ScheduledJobHandle } from '@shared/queue/scheduled-jobs';
import { nonEmpty } from '@shared/utils/defaults';
import { assertDeploymentInvariants } from '@src/config/deployment-invariants';
import { env } from '@src/config/env';

import { createApp } from './app';

import type { EnrichmentSchedulerPort, MuseumEnrichmentWorker } from '@modules/museum';
import type { CacheService } from '@shared/cache/cache.port';
import type { Server } from 'node:http';

const SHUTDOWN_TIMEOUT_MS = 30_000;

const createRedisConnectionOptions = () =>
  ({
    host: env.redis.host,
    port: env.redis.port,
    password: env.redis.password,
    maxRetriesPerRequest: null,
    enableOfflineQueue: false,
    retryStrategy: (times: number) => Math.min(times * 50, 2000),
    reconnectOnError: (err: Error) => (err.message.includes('READONLY') ? (2 as const) : false),
  }) as const;

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
        error: errorMessage(err),
      });
    });

    const redisClient = new Redis(env.cache.url, {
      maxRetriesPerRequest: 1,
      lazyConnect: false,
      enableReadyCheck: false,
      connectionName: 'rate-limit',
      retryStrategy: (times) => Math.min(times * 50, 2000),
      reconnectOnError: (err) => (err.message.includes('READONLY') ? 2 : false),
      ...(redisPassword ? { password: redisPassword } : {}),
    });
    redisClient.on('error', (err) => {
      logger.warn('redis_rate_limit_connection_error', {
        error: nonEmpty(err.message) ?? 'unknown',
      });
    });
    const redisRateLimitStore = new RedisRateLimitStore(redisClient);
    setRedisRateLimitStore(redisRateLimitStore);
    setLlmCostCounter(new RedisLlmCostCounter(redisClient));
    setSocialNonceStore(new RedisNonceStore(redisClient));
    const accessTokenDenylist = new RedisAccessTokenDenylist(redisClient);
    setAccessTokenDenylist(accessTokenDenylist);
    authSessionService.setAccessTokenDenylist(accessTokenDenylist);
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

async function startEnrichmentScheduler(): Promise<EnrichmentSchedulerPort | undefined> {
  if (!env.museumEnrichmentSchedulerEnabled) {
    logger.info('enrichment_scheduler_disabled', {
      reason: 'museum_enrichment_scheduler_flag_off',
    });
    return undefined;
  }
  try {
    const queue = new BullmqMuseumEnrichmentQueueAdapter(createRedisConnectionOptions());
    const useCase = buildRefreshStaleEnrichmentsUseCase(queue);
    const purgeUseCase = buildPurgeDeadEnrichmentsUseCase();
    const scheduler = createBullmqEnrichmentScheduler(
      useCase,
      { connection: createRedisConnectionOptions() },
      purgeUseCase,
      env.enrichment.hardDeleteAfterDays,
    );
    await scheduler.start();
    return scheduler;
  } catch (err) {
    logger.warn('enrichment_scheduler_boot_skipped', {
      error: errorMessage(err),
    });
    return undefined;
  }
}

function startEnrichmentWorker(): MuseumEnrichmentWorker | undefined {
  if (!env.cache?.enabled) {
    logger.info('enrichment_worker_disabled', {
      reason: 'redis_unavailable',
    });
    return undefined;
  }
  try {
    const worker = buildMuseumEnrichmentWorker(createRedisConnectionOptions());
    worker.start();
    logger.info('enrichment_worker_started');
    return worker;
  } catch (err) {
    logger.warn('enrichment_worker_boot_skipped', {
      error: errorMessage(err),
    });
    return undefined;
  }
}

const AUDIT_CRON_QUEUE_NAME = 'audit-cron';

async function startAuditCron(): Promise<{
  handle: AuditCronHandle | undefined;
  queue: Queue | undefined;
}> {
  try {
    const connection = createRedisConnectionOptions();
    const queue = new Queue(AUDIT_CRON_QUEUE_NAME, {
      connection,
      defaultJobOptions: { removeOnComplete: 50, removeOnFail: 100 },
    });
    const handle = await registerAuditCron(queue, AppDataSource, { connection });
    return { handle, queue };
  } catch (err) {
    logger.warn('audit_cron_boot_skipped', {
      error: errorMessage(err),
    });
    return { handle: undefined, queue: undefined };
  }
}

interface ShutdownResources {
  server: Server;
  tokenCleanup: TokenCleanupService;
  redisClient: Redis | undefined;
  cacheService: CacheService;
  poolMonitor: NodeJS.Timeout;
  enrichmentScheduler: EnrichmentSchedulerPort | undefined;
  enrichmentWorker: MuseumEnrichmentWorker | undefined;
  auditCron: AuditCronHandle | undefined;
  auditCronQueue: Queue | undefined;
  chatPurgeCron: ChatPurgeCronHandle | undefined;
  s3OrphanPurgeCron: S3OrphanPurgeCronHandle | undefined;
  retentionCrons: ScheduledJobHandle[];
}

function stopSynchronousSchedulers(
  tokenCleanup: TokenCleanupService,
  poolMonitor: NodeJS.Timeout,
): void {
  tokenCleanup.stopScheduler();
  clearInterval(poolMonitor);
  stopRateLimitSweep();
  stopArtKeywordsRefresh();
}

async function drainAsyncResources(resources: ShutdownResources): Promise<void> {
  const {
    enrichmentScheduler,
    enrichmentWorker,
    auditCron,
    auditCronQueue,
    chatPurgeCron,
    s3OrphanPurgeCron,
    retentionCrons,
    cacheService,
  } = resources;

  await safeClose('knowledge_extraction_shutdown_error', () => stopKnowledgeExtraction());
  await safeClose('wikidata_breaker_shutdown_error', () => {
    stopWikidataBreaker();
  });
  if (enrichmentScheduler) {
    await safeClose('enrichment_scheduler_shutdown_error', () => enrichmentScheduler.stop());
  }
  if (enrichmentWorker) {
    await safeClose('enrichment_worker_shutdown_error', () => enrichmentWorker.close());
  }
  if (auditCron) {
    await safeClose('audit_cron_shutdown_error', () => auditCron.stop());
  }
  if (auditCronQueue) {
    await safeClose('audit_cron_queue_close_failed', () => auditCronQueue.close());
  }
  if (chatPurgeCron) {
    await safeClose('chat_purge_cron_shutdown_error', () => chatPurgeCron.stop());
  }
  if (s3OrphanPurgeCron) {
    await safeClose('s3_orphan_purge_cron_shutdown_error', () => s3OrphanPurgeCron.stop());
  }
  for (const handle of retentionCrons) {
    await safeClose('retention_cron_shutdown_error', () => handle.close());
  }
  await safeClose('embeddings_adapter_shutdown_failed', () => shutdownEmbeddingsAdapter());
  await shutdownOpenTelemetry();
  const ocr = getOcrService();
  if (ocr.destroy) await ocr.destroy();
  if (cacheService.destroy) await cacheService.destroy();
}

async function flushTelemetryAndFinalize(redisClient: Redis | undefined): Promise<void> {
  await finalizeShutdown(redisClient);
}

async function finalizeShutdown(redisClient: Redis | undefined): Promise<void> {
  try {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
      logger.info('database_closed');
    }
  } finally {
    if (redisClient) {
      await safeClose('redis_rate_limit_close_failed', async () => {
        await redisClient.quit();
      });
      logger.info('redis_rate_limit_closed');
    }
    process.exit(0);
  }
}

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
      void flushTelemetryAndFinalize(redisClient);
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

type CronRegister<H> = (
  ds: typeof AppDataSource,
  cfg: { connection: ReturnType<typeof createRedisConnectionOptions>; retentionDays: number },
) => Promise<H>;

async function startRedisCron<H>(
  register: CronRegister<H>,
  retentionDays: number,
  skipLog: string,
): Promise<H | undefined> {
  if (!env.cache?.enabled) return undefined;
  try {
    return await register(AppDataSource, {
      connection: createRedisConnectionOptions(),
      retentionDays,
    });
  } catch (err) {
    logger.warn(skipLog, { error: errorMessage(err) });
    return undefined;
  }
}

async function startRetentionCrons(): Promise<ScheduledJobHandle[]> {
  if (!env.cache?.enabled) {
    logger.info('retention_crons_disabled', {
      reason: 'redis_unavailable',
    });
    return [];
  }
  try {
    const connection = createRedisConnectionOptions();
    const {
      cronPattern,
      batchLimit,
      supportTicketsDays,
      reviewsRejectedDays,
      reviewsPendingDays,
      artKeywordsDays,
      artKeywordsHitThreshold,
    } = env.retention;

    const supportHandle = registerSupportRetentionCron(AppDataSource, {
      connection,
      cronPattern,
      daysClosed: supportTicketsDays,
      batchLimit,
    });
    const reviewHandle = registerReviewRetentionCron(AppDataSource, {
      connection,
      cronPattern,
      rejectedDays: reviewsRejectedDays,
      pendingDays: reviewsPendingDays,
      batchLimit,
    });
    const artKeywordsHandle = registerArtKeywordsRetentionCron(AppDataSource, {
      connection,
      cronPattern,
      days: artKeywordsDays,
      hitThreshold: artKeywordsHitThreshold,
      batchLimit,
    });
    const leadsRedeliveryHandle = registerLeadsRedeliveryCron(new LeadRepositoryPg(AppDataSource), {
      connection,
      cronPattern: env.leads.redeliveryCronPattern,
      maxAttempts: env.leads.maxAttempts,
      batchLimit: env.leads.redeliveryBatchLimit,
      retentionDays: env.leads.retentionDays,
      backoffBaseMs: env.leads.backoffBaseMs,
      backoffCapMs: env.leads.backoffCapMs,
    });

    await supportHandle.start();
    await reviewHandle.start();
    await artKeywordsHandle.start();
    await leadsRedeliveryHandle.start();

    logger.info('retention_crons_started', { cronPattern });
    return [supportHandle, reviewHandle, artKeywordsHandle, leadsRedeliveryHandle];
  } catch (err) {
    logger.warn('retention_crons_boot_skipped', {
      error: errorMessage(err),
    });
    return [];
  }
}

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
  const enrichmentWorker = startEnrichmentWorker();
  const { handle: auditCron, queue: auditCronQueue } = env.cache?.enabled
    ? await startAuditCron()
    : { handle: undefined, queue: undefined };
  const chatPurgeCron = await startRedisCron(
    registerChatPurgeCron,
    env.chatPurgeRetentionDays,
    'chat_purge_cron_boot_skipped',
  );
  const s3OrphanPurgeCron = await startRedisCron(
    registerS3OrphanPurgeCron,
    env.s3OrphanPurgeRetentionDays,
    's3_orphan_purge_cron_boot_skipped',
  );
  const retentionCrons = await startRetentionCrons();

  return {
    tokenCleanup,
    poolMonitor,
    enrichmentScheduler,
    enrichmentWorker,
    auditCron,
    auditCronQueue,
    chatPurgeCron,
    s3OrphanPurgeCron,
    retentionCrons,
  };
}

function logStartupFailure(error: unknown): void {
  const detail =
    error instanceof Error ? error.message || util.inspect(error) : util.inspect(error);
  logger.error('startup_failed', {
    error: detail,
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

const start = async (): Promise<void> => {
  assertDeploymentInvariants(env, { logger });

  try {
    await AppDataSource.initialize();
    logger.info('database_initialized', {
      host: env.db.host,
      database: env.db.database,
    });

    setMonthlyQuotaRepo(new PgMonthlyQuotaRepo(AppDataSource));

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
