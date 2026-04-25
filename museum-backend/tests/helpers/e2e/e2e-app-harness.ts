import { readdirSync } from 'node:fs';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { join } from 'node:path';

import type { DataSource, MigrationInterface } from 'typeorm';

import {
  StartedPostgresTestContainer,
  startPostgresTestContainer,
} from 'tests/helpers/e2e/postgres-testcontainer';

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
    import('@modules/chat/useCase/chat.service'),
    import('@modules/chat/adapters/secondary/chat.repository.typeorm'),
    import('@modules/chat/adapters/secondary/image-storage.stub'),
    import('@src/helpers/middleware/rate-limit.middleware'),
    discoverMigrationClasses(),
  ]);

  clearRateLimitBuckets();

  const appDataSource = AppDataSource;

  (appDataSource.options as { migrations?: unknown[] }).migrations = discoveredMigrations;

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
      postgresContainer.scheduleStop();
    }
  };

  return { baseUrl, request, dataSource: appDataSource, stop };
}
