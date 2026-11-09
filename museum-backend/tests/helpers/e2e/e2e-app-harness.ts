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
import type { AuditService } from '@shared/audit/audit.service';
import type { CacheService } from '@shared/cache/cache.port';

const MIGRATIONS_DIR = join(__dirname, '..', '..', '..', 'src', 'data', 'db', 'migrations');

type MigrationCtor = new () => MigrationInterface;

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

export interface E2EResponse {
  status: number;
  body: unknown;
}

interface SwappableOrchestrator extends ChatOrchestrator {
  __swap(next: ChatOrchestrator): void;
}

function createSwappableOrchestrator(initial: ChatOrchestrator): SwappableOrchestrator {
  let delegate: ChatOrchestrator = initial;
  return {
    async generate(input) {
      return delegate.generate(input);
    },
    __swap(next: ChatOrchestrator): void {
      delegate = next;
    },
  };
}

export interface E2EHarnessOptions {
  cacheService?: CacheService;
  chatOrchestratorOverride?: ChatOrchestrator;
  auditServiceOverride?: AuditService;
  startKnowledgeExtractionWorker?: boolean;
}

export interface E2EHarness {
  baseUrl: string;
  request: (path: string, init?: RequestInit, token?: string) => Promise<E2EResponse>;
  dataSource: DataSource;
  stop: () => Promise<void>;
  testEmailService: import('@src/shared/email/test-email-service').TestEmailService | null;
  orchestratorReset: (newOverride: ChatOrchestrator) => void;
}

export async function createE2EHarness(options?: E2EHarnessOptions): Promise<E2EHarness> {
  const postgresContainer: StartedPostgresTestContainer = await startPostgresTestContainer();

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
  process.env.AUTH_REGISTER_RATE_LIMIT = '10000';
  process.env.AUTH_REGISTER_RATE_WINDOW_MS = '60000';
  process.env.AUTH_LOGIN_RATE_LIMIT = '10000';
  process.env.AUTH_LOGIN_RATE_WINDOW_MS = '60000';
  process.env.LLM_PROVIDER = 'openai';
  process.env.OPENAI_API_KEY = 'e2e-fake-openai-key';
  process.env.EXTRACTION_WORKER_ENABLED = 'false';
  process.env.AUTH_EMAIL_SERVICE_KIND ??= 'test';
  process.env.FRONTEND_URL ??= 'http://localhost:8081';
  process.env.PASSWORD_BREACH_CHECK_ENABLED ??= 'false';
  process.env.APPLE_OIDC_JWKS_URL ??= 'https://appleid.apple.com/auth/keys';
  process.env.GOOGLE_OIDC_JWKS_URL ??= 'https://www.googleapis.com/oauth2/v3/certs';
  process.env.OIDC_NONCE_ENFORCE ??= 'false';
  process.env.APPLE_CLIENT_ID ??= 'com.musaium.mobile.test';
  process.env.GOOGLE_OAUTH_CLIENT_ID ??= 'phase5-test-audience.apps.googleusercontent.com';

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
    import('@shared/middleware/rate-limit.middleware'),
    discoverMigrationClasses(),
  ]);

  clearRateLimitBuckets();

  const appDataSource = AppDataSource;

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

  (
    appDataSource.driver as {
      master?: { on?: (event: string, listener: () => void) => void };
    }
  ).master?.on?.('error', () => undefined);

  await appDataSource.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  await appDataSource.runMigrations({ transaction: 'each' });

  const { buildChatService } = await import('@modules/chat');
  buildChatService(appDataSource);

  const resolvedOrchestrator: ChatOrchestrator =
    options?.chatOrchestratorOverride ??
    ({
      async generate() {
        return {
          text: 'Synthetic assistant response for e2e',
          metadata: { citations: ['e2e'] },
          degraded: false,
        };
      },
    } as ChatOrchestrator);

  const swappableOrchestrator = createSwappableOrchestrator(resolvedOrchestrator);

  const { ResilientCacheWrapper } = await import('@shared/cache/resilient-cache.wrapper');
  const wrappedCache = options?.cacheService
    ? new ResilientCacheWrapper(options.cacheService)
    : undefined;

  const chatService = new ChatService({
    repository: new TypeOrmChatRepository(appDataSource),
    orchestrator: swappableOrchestrator,
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
    audit: options?.auditServiceOverride,
  });

  const app = createApp({ chatService });

  const authModule = await import('@modules/auth/useCase');
  const testEmailService = authModule.__testEmailService ?? null;

  let server: Server;
  let stopped = false;
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
    stopped = true;
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
      await postgresContainer.stop();
    }
  };

  return {
    baseUrl,
    request,
    dataSource: appDataSource,
    stop,
    testEmailService,
    orchestratorReset: (newOverride: ChatOrchestrator) => {
      if (stopped) {
        throw new Error('orchestratorReset called after harness.stop() — invalid usage');
      }
      swappableOrchestrator.__swap(newOverride);
    },
  };
}
