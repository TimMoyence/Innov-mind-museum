import type { Server } from 'http';
import type { AddressInfo } from 'net';
import type { DataSource } from 'typeorm';

import {
  StartedPostgresTestContainer,
  startPostgresTestContainer,
} from 'tests/helpers/e2e/postgres-testcontainer';

/**
 * Parsed HTTP response returned by the harness `request()` helper.
 */
export interface E2EResponse {
  status: number;
  body: unknown;
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
}

/**
 * Boots a full E2E environment: Postgres testcontainer, all migrations, ChatService
 * with a fake orchestrator, and an Express server listening on port 0.
 *
 * Mirrors the exact setup from `api.postgres.e2e.test.ts` but extracted into a reusable function.
 */
export async function createE2EHarness(): Promise<E2EHarness> {
  const postgresContainer: StartedPostgresTestContainer =
    await startPostgresTestContainer();

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
  process.env.LLM_PROVIDER = 'openai';
  process.env.OPENAI_API_KEY = 'e2e-fake-openai-key';

  // Dynamic imports — env vars must be ready before these run.
  const [
    { createApp },
    { AppDataSource },
    { InitDatabase1771427010387 },
    { AddAuthRefreshTokens1771800000000 },
    { EnsureChatTables1771900000000 },
    { DropLegacyImageInsightTables1772000000000 },
    { FixChatSessionsUserFk1772000000001 },
    { AddMuseumContextToSessions1772000000002 },
    { AddMessageReports1773820507870 },
    { AddSocialAccountsAndNullablePassword1773823617791 },
    { RecreateRefreshTokenIndexes1773852493401 },
    { AddEmailVerification1773939685275 },
    { CreateApiKeysTable1773955771280 },
    { AddSessionVersionColumn1774000000000 },
    { NormalizeEmailCase1774100000000 },
    { AddUserRoleColumn1774200000000 },
    { CreateAuditLogsTable1774200100000 },
    { CreateMuseumsAndTenantFKs1774300000000 },
    { CreateUserMemoriesTable1774300100000 },
    { AddModerationColumnsToMessageReports1774400000000 },
    { CreateSupportTables1774400100000 },
    { AddMuseumCoordinates1774500000000 },
    { ChatService },
    { TypeOrmChatRepository },
    { LocalImageStorage },
  ] = await Promise.all([
    import('@src/app'),
    import('@src/data/db/data-source'),
    import('@src/data/db/migrations/1771427010387-InitDatabase'),
    import('@src/data/db/migrations/1771800000000-AddAuthRefreshTokens'),
    import('@src/data/db/migrations/1771900000000-EnsureChatTables'),
    import('@src/data/db/migrations/1772000000000-DropLegacyImageInsightTables'),
    import('@src/data/db/migrations/1772000000001-FixChatSessionsUserFk'),
    import('@src/data/db/migrations/1772000000002-AddMuseumContextToSessions'),
    import('@src/data/db/migrations/1773820507870-AddMessageReports'),
    import('@src/data/db/migrations/1773823617791-AddSocialAccountsAndNullablePassword'),
    import('@src/data/db/migrations/1773852493401-RecreateRefreshTokenIndexes'),
    import('@src/data/db/migrations/1773939685275-AddEmailVerification'),
    import('@src/data/db/migrations/1773955771280-CreateApiKeysTable'),
    import('@src/data/db/migrations/1774000000000-AddSessionVersionColumn'),
    import('@src/data/db/migrations/1774100000000-NormalizeEmailCase'),
    import('@src/data/db/migrations/1774200000000-AddUserRoleColumn'),
    import('@src/data/db/migrations/1774200100000-CreateAuditLogsTable'),
    import('@src/data/db/migrations/1774300000000-CreateMuseumsAndTenantFKs'),
    import('@src/data/db/migrations/1774300100000-CreateUserMemoriesTable'),
    import('@src/data/db/migrations/1774400000000-AddModerationColumnsToMessageReports'),
    import('@src/data/db/migrations/1774400100000-CreateSupportTables'),
    import('@src/data/db/migrations/1774500000000-AddMuseumCoordinates'),
    import('@modules/chat/application/chat.service'),
    import('@modules/chat/infrastructure/chat.repository.typeorm'),
    import('@modules/chat/adapters/secondary/image-storage.stub'),
  ]);

  const appDataSource = AppDataSource;

  (appDataSource.options as { migrations?: unknown[] }).migrations = [
    InitDatabase1771427010387,
    AddAuthRefreshTokens1771800000000,
    EnsureChatTables1771900000000,
    DropLegacyImageInsightTables1772000000000,
    FixChatSessionsUserFk1772000000001,
    AddMuseumContextToSessions1772000000002,
    AddMessageReports1773820507870,
    AddSocialAccountsAndNullablePassword1773823617791,
    RecreateRefreshTokenIndexes1773852493401,
    AddEmailVerification1773939685275,
    CreateApiKeysTable1773955771280,
    AddSessionVersionColumn1774000000000,
    NormalizeEmailCase1774100000000,
    AddUserRoleColumn1774200000000,
    CreateAuditLogsTable1774200100000,
    CreateMuseumsAndTenantFKs1774300000000,
    CreateUserMemoriesTable1774300100000,
    AddModerationColumnsToMessageReports1774400000000,
    CreateSupportTables1774400100000,
    AddMuseumCoordinates1774500000000,
  ];

  await appDataSource.initialize();

  // Suppress stale-connection errors from the underlying pg driver.
  (
    appDataSource.driver as {
      master?: { on?: (event: string, listener: () => void) => void };
    }
  ).master?.on?.('error', () => undefined);

  await appDataSource.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  await appDataSource.runMigrations();

  const chatService = new ChatService({
    repository: new TypeOrmChatRepository(appDataSource),
    orchestrator: {
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
    },
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

  let server: Server;
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
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
      postgresContainer.scheduleStop();
    }
  };

  return { baseUrl, request, dataSource: appDataSource, stop };
}
