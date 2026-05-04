import { readdirSync } from 'node:fs';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { join } from 'node:path';

import type { DataSource, MigrationInterface } from 'typeorm';

import {
  StartedPostgresTestContainer,
  startPostgresTestContainer,
} from 'tests/helpers/e2e/postgres-testcontainer';

import type { ChatOrchestrator } from '@modules/chat/domain/ports/chat-orchestrator.port';
import type { CacheService } from '@shared/cache/cache.port';

/**
 * Absolute path to the canonical TypeORM migrations folder.
 * Resolved relative to this file so the harness keeps working regardless of cwd.
 */
const MIGRATIONS_DIR = join(__dirname, '..', '..', '..', 'src', 'data', 'db', 'migrations');

/**
 * Constructor type for a TypeORM migration class — what `runMigrations()` expects.
 */
type MigrationCtor = new () => MigrationInterface;

/**
 * Auto-discovers every TypeORM migration on disk, in timestamp order.
 *
 * Loads each `.ts` file in `src/data/db/migrations/` via dynamic import (transformed
 * by ts-jest at test time) and returns the exported migration class constructors.
 *
 * Sorting alphabetically is sufficient because the project convention prefixes every
 * migration filename with a fixed-width millisecond timestamp (e.g. `1777100000000-...`).
 *
 * Replacing the previous hardcoded list removes the footgun where new migrations
 * silently fail to run in e2e tests until the harness is manually updated.
 * @returns The migration class constructors discovered on disk, in timestamp order.
 */
async function discoverMigrationClasses(): Promise<MigrationCtor[]> {
  const migrationFiles = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.d.ts'))
    .sort((a, b) => a.localeCompare(b));

  if (migrationFiles.length === 0) {
    throw new Error(
      `e2e harness: no migrations discovered in ${MIGRATIONS_DIR} — refusing to boot empty schema`,
    );
  }

  const modules = await Promise.all(
    migrationFiles.map(
      (file) => import(join(MIGRATIONS_DIR, file)) as Promise<Record<string, unknown>>,
    ),
  );

  const classes: MigrationCtor[] = [];
  modules.forEach((mod, index) => {
    const exported = Object.values(mod).filter(
      (value): value is MigrationCtor => typeof value === 'function',
    );
    if (exported.length === 0) {
      throw new Error(
        `e2e harness: migration file ${migrationFiles[index]} exports no class — invalid migration`,
      );
    }
    classes.push(...exported);
  });

  return classes;
}

/**
 * Parsed HTTP response returned by the harness `request()` helper.
 */
export interface E2EResponse {
  status: number;
  body: unknown;
}

/**
 * Options accepted by {@link createE2EHarness}.
 * All fields are optional — omitting them preserves the existing default behaviour.
 */
export interface E2EHarnessOptions {
  /**
   * Phase 6 chaos: override the cache service injected into ChatService.
   * Defaults to undefined (ChatService uses its own default — no cache in e2e).
   */
  cacheService?: CacheService;
  /**
   * Phase 6 chaos: override the chat orchestrator.
   * Replaces the harness's synthetic orchestrator with any compatible implementation.
   */
  chatOrchestratorOverride?: ChatOrchestrator;
  /**
   * Phase 6 chaos: whether to start the BullMQ knowledge-extraction worker.
   * Default: false (worker is NOT started in e2e — matches existing behaviour because
   * EXTRACTION_WORKER_ENABLED=false is set by default in the harness env block).
   */
  startKnowledgeExtractionWorker?: boolean;
}

/**
 * Re-usable E2E test harness wrapping a real Postgres container, fully-migrated
 * DataSource, fake chat orchestrator, and an Express server on a random port.
 */
export interface E2EHarness {
  /** Full base URL including `http://` and dynamic port, e.g. `http://127.0.0.1:54321`. */
  baseUrl: string;
  /** Convenience HTTP helper — serializes JSON body, injects Bearer token, parses response. */
  request: (path: string, init?: RequestInit, token?: string) => Promise<E2EResponse>;
  /** Live TypeORM DataSource — useful for direct DB queries (e.g. promoting a user to admin). */
  dataSource: DataSource;
  /** Tears down the server, DataSource, and schedules container cleanup. */
  stop: () => Promise<void>;
  /**
   * Phase 5 — in-memory email service instance active when
   * `AUTH_EMAIL_SERVICE_KIND=test`. Null when another email backend is used.
   * Use to retrieve verification tokens after registration in e2e tests.
   */
  testEmailService: import('@src/shared/email/test-email-service').TestEmailService | null;
}

/**
 * Boots a full E2E environment: Postgres testcontainer, all migrations, ChatService
 * with a fake orchestrator, and an Express server listening on port 0.
 *
 * Mirrors the exact setup from `api.postgres.e2e.test.ts` but extracted into a reusable function.
 * @param options
 */
export async function createE2EHarness(options?: E2EHarnessOptions): Promise<E2EHarness> {
  // NOTE: we intentionally do NOT call `jest.resetModules()` here. Resetting
  // the module cache between harnesses produced two pre-merge regressions:
  //   1. Pre-imported entity classes (`import { ExtractedContent }` at the top
  //      of an e2e test file) ended up with a different class identity than
  //      the entities registered on the post-reset AppDataSource → TypeORM's
  //      `getRepository(ExtractedContent)` raised "EntityMetadataNotFound".
  //   2. Pre-imported error classes (`AppError`, `CircuitOpenError`) had a
  //      different prototype chain than the post-reset middleware, so
  //      `instanceof AppError` failed and 503s degraded to 500.
  // Instead, we keep a single set of module instances and re-bind the
  // singleton AppDataSource to the freshly-started container (see below).
  const postgresContainer: StartedPostgresTestContainer = await startPostgresTestContainer();

  // Environment variables MUST be set before any dynamic import that touches `env.ts`.
  process.env.NODE_ENV = 'test';
  process.env.PORT = '0';
  process.env.TRUST_PROXY = 'false';
  process.env.CORS_ORIGINS = 'http://localhost:8081';
  process.env.DB_HOST = postgresContainer.host;
  process.env.DB_PORT = String(postgresContainer.port);
  process.env.DB_USER = postgresContainer.user;
  process.env.DB_PASSWORD = postgresContainer.password;
  process.env.PGDATABASE = postgresContainer.database;
  process.env.DB_SYNCHRONIZE = 'false';
  process.env.JWT_ACCESS_SECRET = 'e2e-access-secret';
  process.env.JWT_REFRESH_SECRET = 'e2e-refresh-secret';
  process.env.RATE_LIMIT_IP = '1000';
  process.env.RATE_LIMIT_SESSION = '1000';
  // Auth register/login limits are hardcoded tight in prod (5/10min and 10/5min).
  // Bumped high for e2e because `--runInBand` shares a single in-memory store
  // across all 62 e2e tests from the same 127.0.0.1.
  process.env.AUTH_REGISTER_RATE_LIMIT = '10000';
  process.env.AUTH_REGISTER_RATE_WINDOW_MS = '60000';
  process.env.AUTH_LOGIN_RATE_LIMIT = '10000';
  process.env.AUTH_LOGIN_RATE_WINDOW_MS = '60000';
  process.env.LLM_PROVIDER = 'openai';
  process.env.OPENAI_API_KEY = 'e2e-fake-openai-key';
  // No Redis in e2e — disable the BullMQ extraction worker + enrichment scheduler
  // to prevent ioredis ECONNREFUSED log floods on 127.0.0.1:6379.
  process.env.EXTRACTION_WORKER_ENABLED = 'false';
  // Phase 5 — activate the in-memory email service so e2e tests can intercept
  // verification emails without a real Brevo API key. FRONTEND_URL is required
  // because RegisterUseCase + ForgotPasswordUseCase only send mail when BOTH
  // emailService AND frontendUrl are truthy (used to build the verify link).
  process.env.AUTH_EMAIL_SERVICE_KIND ??= 'test';
  process.env.FRONTEND_URL ??= 'http://localhost:8081';
  // F10 — disable HIBP breach gate in e2e. Avoids a real network round-trip
  // to api.pwnedpasswords.com on every register/reset call (which also breaks
  // the canonical fixture password `Password123!` because it appears in the
  // public breach corpus). The gate itself is unit-tested independently.
  process.env.PASSWORD_BREACH_CHECK_ENABLED ??= 'false';
  // Phase 5 — social-login JWKS spoof. Placeholder URLs; the social-login e2e
  // test starts the real spoof server in beforeAll and overrides these env vars
  // BEFORE calling createE2EHarness() so env.ts reads the correct spoof URL.
  // In all other e2e suites these defaults point at canonical provider endpoints
  // (which are never actually called because social-login is not exercised).
  process.env.APPLE_OIDC_JWKS_URL ??= 'https://appleid.apple.com/auth/keys';
  process.env.GOOGLE_OIDC_JWKS_URL ??= 'https://www.googleapis.com/oauth2/v3/certs';
  process.env.OIDC_NONCE_ENFORCE ??= 'false';
  // Apple audience defaults to the app bundle id; GOOGLE_OAUTH_CLIENT_ID left
  // unset so env.ts returns an empty array (social login is mocked in e2e via spoof).
  process.env.APPLE_CLIENT_ID ??= 'com.musaium.mobile.test';
  process.env.GOOGLE_OAUTH_CLIENT_ID ??= 'phase5-test-audience.apps.googleusercontent.com';

  // Dynamic imports — env vars must be ready before these run.
  const [
    { createApp },
    { AppDataSource },
    { ChatService },
    { TypeOrmChatRepository },
    { LocalImageStorage },
    { clearRateLimitBuckets },
    discoveredMigrations,
  ] = await Promise.all([
    import('@src/app'),
    import('@src/data/db/data-source'),
    import('@modules/chat/useCase/orchestration/chat.service'),
    import('@modules/chat/adapters/secondary/persistence/chat.repository.typeorm'),
    import('@modules/chat/adapters/secondary/storage/image-storage.stub'),
    import('@src/helpers/middleware/rate-limit.middleware'),
    discoverMigrationClasses(),
  ]);

  clearRateLimitBuckets();

  const appDataSource = AppDataSource;

  // Re-bind the singleton DataSource to the freshly-started container. The
  // module-level `new DataSource({ host: env.db.host, ... })` snapshot was
  // taken from env vars at first import; by the time the SECOND harness boots
  // (e.g. golden-paths-admin's three describe blocks) the env points at a
  // new container but the DataSource still holds the old host/port. Mutate
  // the options object in place + destroy() any prior connection so the next
  // initialize() opens a fresh pool against the right container.
  const dsOptions = appDataSource.options as {
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    database?: string;
    migrations?: unknown[];
  };
  dsOptions.host = postgresContainer.host;
  dsOptions.port = postgresContainer.port;
  dsOptions.username = postgresContainer.user;
  dsOptions.password = postgresContainer.password;
  dsOptions.database = postgresContainer.database;
  dsOptions.migrations = discoveredMigrations;

  if (appDataSource.isInitialized) {
    await appDataSource.destroy();
  }
  await appDataSource.initialize();

  // Suppress stale-connection errors from the underlying pg driver.
  (
    appDataSource.driver as {
      master?: { on?: (event: string, listener: () => void) => void };
    }
  ).master?.on?.('error', () => undefined);

  await appDataSource.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  // Some migrations declare `transaction = false` (e.g. the CONCURRENTLY index
  // migrations P0/P1). TypeORM defaults `migrationsTransactionMode` to "all" when
  // unset, which conflicts with per-migration overrides and triggers
  // `ForbiddenTransactionModeOverrideError`. Forcing `transaction: 'each'` here
  // matches CLI behaviour (the project's `migration:run` script) without changing
  // the global DataSource options.
  await appDataSource.runMigrations({ transaction: 'each' });

  // Build the chat module singleton so wiring helpers (e.g. `getChatRepository`
  // used by the GDPR DSAR export proxy in `@modules/auth/useCase`) can resolve
  // their dependencies. The harness still injects its own mock-orchestrator
  // ChatService into the Express app below — `buildChatService` is just here
  // to populate the singleton's other slots (repository, imageStorage, etc.).
  const { buildChatService } = await import('@modules/chat');
  buildChatService(appDataSource);

  // Phase 6 chaos: allow callers to override the orchestrator.
  // Falls back to the existing synthetic stub when no override is provided.
  const orchestrator = options?.chatOrchestratorOverride ?? {
    async generate() {
      return {
        text: 'Synthetic assistant response for e2e',
        metadata: { citations: ['e2e'] },
      };
    },
    async generateStream(_input: unknown, onChunk: (t: string) => void) {
      const result = {
        text: 'Synthetic assistant response for e2e',
        metadata: { citations: ['e2e'] },
      };
      onChunk(result.text);
      return result;
    },
  };

  const { ResilientCacheWrapper } = await import('@shared/cache/resilient-cache.wrapper');
  // Wrap any caller-provided cacheService (e.g. BrokenRedisCache from the chaos
  // suite) in the resilient wrapper so backend failures degrade to cache-miss
  // instead of bubbling up as 500s — matches the createApp() path.
  const wrappedCache = options?.cacheService
    ? new ResilientCacheWrapper(options.cacheService)
    : undefined;

  const chatService = new ChatService({
    repository: new TypeOrmChatRepository(appDataSource),
    // Phase 6 chaos: orchestrator and cache are configurable via options.

    orchestrator: orchestrator as any,
    // Phase 6 chaos: cacheService override (undefined = no cache, matching existing behaviour).
    cache: wrappedCache,
    imageStorage: new LocalImageStorage(),
    audioTranscriber: {
      async transcribe() {
        return {
          text: 'Transcribed voice question for e2e',
          model: 'e2e-audio-model',
          provider: 'openai' as const,
        };
      },
    },
  });

  const app = createApp({ chatService });

  // Phase 5 — retrieve the TestEmailService singleton exported by the auth
  // composition root (only non-null when AUTH_EMAIL_SERVICE_KIND='test').
  const authModule = await import('@modules/auth/useCase');
  const testEmailService = authModule.__testEmailService ?? null;

  let server: Server;
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      resolve();
    });
  });

  const address = server!.address() as AddressInfo | null;
  if (!address) {
    throw new Error('Could not determine server address for e2e tests');
  }

  const baseUrl = `http://127.0.0.1:${address.port}`;

  const request = async (
    path: string,
    init: RequestInit = {},
    token?: string,
  ): Promise<E2EResponse> => {
    const headers = new Headers(init.headers || undefined);

    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    if (typeof init.body === 'string' && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers,
    });

    const rawBody = await response.text();
    let body: unknown = rawBody || null;

    if (rawBody) {
      try {
        body = JSON.parse(rawBody);
      } catch {
        body = rawBody;
      }
    }

    return { status: response.status, body };
  };

  const stop = async (): Promise<void> => {
    if (server!) {
      await new Promise<void>((resolve, reject) => {
        server!.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }

    if (appDataSource?.isInitialized) {
      await appDataSource.destroy();
    }

    if (postgresContainer) {
      // Synchronous stop: scheduleStop's detached `sleep 30` cleanup process is
      // killed when Jest exits (forceExit + macOS process-group propagation),
      // leaking the container. Awaiting stop() costs ~1s per suite (SIGTERM
      // grace --time 1 + container --rm auto-removal) and guarantees cleanup.
      await postgresContainer.stop();
    }
  };

  return { baseUrl, request, dataSource: appDataSource, stop, testEmailService };
}
