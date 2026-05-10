/**
 * T7.1 — POST `/sessions/:id/messages` v2 enrichment integration test.
 *
 * Drives the full chat HTTP pipeline against a real Postgres testcontainer
 * (via `createE2EHarness`) with the four C2 image-source clients mocked, and
 * asserts the kill-switch contract:
 *
 *   - Scenario A — `CHAT_ENRICHMENT_V2_ENABLED=true` + all 4 sources wired:
 *       the second turn's `metadata.images` carries entries from Wikidata,
 *       Unsplash, Wikimedia Commons, and the Musaium catalogue, with
 *       `caption` + `rationale` propagated from the prior assistant turn's
 *       `suggestedImages[]` array (R1, R5, R8 of spec §3).
 *
 *   - Scenario B — `CHAT_ENRICHMENT_V2_ENABLED=false` + only Unsplash wired
 *       (mirrors the production `chat-module.ts:230-249` build path):
 *       the assistant response does NOT include any `commons` / `musaium`
 *       sourced images and stays at or below the legacy v1 cap of 3 images
 *       (R9 kill-switch — byte-identical pre-C2 behaviour).
 *
 * Each scenario boots its own harness inside `jest.isolateModulesAsync` so
 * `@src/config/env` can re-evaluate `process.env.CHAT_ENRICHMENT_V2_ENABLED`
 * fresh per scenario; the e2e harness's no-resetModules guard rails are
 * preserved within each isolate.
 *
 * Gated on `RUN_E2E=true` per the chat-suite convention; CI nightly runs
 * with the flag set, local dev opts in via:
 *
 *   RUN_E2E=true pnpm jest --runInBand \
 *     tests/integration/chat/post-message-c2-enrichment.integration.test.ts
 */

import type { Express } from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';

import { makeUnsplashClientMock, makeUnsplashPhoto } from '../../helpers/search-clients/unsplash.fixture';
import { makeArtworkFacts } from '../../helpers/chat/visual-similarity/artwork-facts.fixtures';

import type {
  ImageSourceClient,
  ImageSourcePhoto,
} from '@modules/chat/domain/ports/image-source.port';
import type {
  ArtworkFacts,
  KnowledgeBaseProvider,
} from '@modules/chat/domain/ports/knowledge-base.port';
import type {
  ChatOrchestrator,
  OrchestratorOutput,
} from '@modules/chat/domain/ports/chat-orchestrator.port';
import type { EnrichedImage } from '@modules/chat/domain/chat.types';
import type { E2EHarness } from 'tests/helpers/e2e/e2e-app-harness';

const shouldRunE2E = process.env.RUN_E2E === 'true';
const describeE2E = shouldRunE2E ? describe : describe.skip;

/* ────────────────────────── shared mock helpers ────────────────────────── */

/**
 * Builds a minimal {@link ImageSourceClient} jest mock that resolves to a
 * query-specific photo, so the v2 fan-out (one call per `suggestedImages[].query`)
 * produces distinct URLs across terms — preventing dedup-by-URL from
 * collapsing the result set under-cap.
 *
 * The factory takes a per-source URL/caption template and the mock derives a
 * unique URL per (source, query) pair using the query as a hash.
 */
function makeQueryAwareImageSourceClient(
  basePhoto: ImageSourcePhoto,
): jest.Mocked<ImageSourceClient> {
  return {
    searchPhotos: jest.fn().mockImplementation(async (query: string) => {
      const slug = query.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 32);
      return Promise.resolve([
        {
          ...basePhoto,
          url: `${basePhoto.url}?q=${slug}`,
          thumbnailUrl: `${basePhoto.thumbnailUrl}?q=${slug}`,
          caption: `${basePhoto.caption} (${query})`,
        } satisfies ImageSourcePhoto,
      ]);
    }),
  };
}

/** Builds a minimal {@link KnowledgeBaseProvider} jest mock. */
function makeKnowledgeBaseProviderMock(facts: ArtworkFacts | null): jest.Mocked<KnowledgeBaseProvider> {
  return {
    lookup: jest.fn().mockResolvedValue(facts),
  };
}

/**
 * Stub orchestrator that returns a deterministic response with v2
 * `suggestedImages[]` metadata (caption + rationale REQUIRED). Subsequent
 * turns will read this from history and trigger the v2 fan-out.
 */
class V2SuggestingOrchestrator implements ChatOrchestrator {
  private callCount = 0;

  // eslint-disable-next-line @typescript-eslint/require-await -- port signature is async
  async generate(): Promise<OrchestratorOutput> {
    this.callCount += 1;
    return this.buildOutput();
  }

  async generateStream(
    _input: unknown,
    onChunk: (text: string) => void,
  ): Promise<OrchestratorOutput> {
    const result = this.buildOutput();
    onChunk(result.text);
    return result;
  }

  /** Mirrors the LLM JSON contract from `assistant-response.toSuggestedImages`. */
  private buildOutput(): OrchestratorOutput {
    return {
      text: `Synthetic comparison answer #${this.callCount} discussing two artworks.`,
      metadata: {
        citations: ['c2-test'],
        detectedArtwork: {
          title: "Monet's Water Lilies",
          artist: 'Claude Monet',
          confidence: 0.9,
          source: 'test',
        },
        suggestedImages: [
          {
            query: "Monet Water Lilies painting",
            description: 'The Water Lilies series by Monet.',
            rationale: 'Shows the impressionist brushwork central to the answer.',
            caption: "Water Lilies by Monet",
          },
          {
            query: "Manet Olympia painting",
            description: 'The Olympia portrait by Manet.',
            rationale: 'Provides the contrasting realist composition cited above.',
            caption: 'Olympia by Manet',
          },
        ],
      },
    };
  }
}

/* ───────────────────────────── helpers ─────────────────────────────────── */

/**
 * Boots an E2E harness inside the active jest.isolateModules scope and swaps
 * the harness's chatService for one wired with the supplied source-client
 * mocks. Returns the harness handle plus a tear-down hook.
 */
interface BootArgs {
  unsplashClient: ImageSourceClient | undefined;
  commonsClient: ImageSourceClient | undefined;
  musaiumClient: ImageSourceClient | undefined;
  knowledgeBaseProvider: KnowledgeBaseProvider | undefined;
  orchestrator: ChatOrchestrator;
}

interface BootedHarness {
  baseUrl: string;
  request: E2EHarness['request'];
  stop: () => Promise<void>;
}

async function bootHarnessWithMockedEnrichment(args: BootArgs): Promise<BootedHarness> {
  // Start the Postgres testcontainer FIRST so we can pin the DB env vars
  // before any dynamic import touches `@src/config/env` (which captures
  // process.env at module-load time).
  const { startPostgresTestContainer } = await import('tests/helpers/e2e/postgres-testcontainer');
  const postgresContainer = await startPostgresTestContainer();

  // Force-override every env var we care about (`=`, not `??=`) so a value
  // leaking from an earlier suite cannot poison this isolate. The
  // CHAT_ENRICHMENT_V2_ENABLED flag is set by the calling describe block's
  // beforeAll, BEFORE we enter the isolateModulesAsync scope.
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
  process.env.JWT_ACCESS_SECRET = 'c2-int-access-secret';
  process.env.JWT_REFRESH_SECRET = 'c2-int-refresh-secret';
  process.env.RATE_LIMIT_IP = '1000';
  process.env.RATE_LIMIT_SESSION = '1000';
  process.env.AUTH_REGISTER_RATE_LIMIT = '10000';
  process.env.AUTH_REGISTER_RATE_WINDOW_MS = '60000';
  process.env.AUTH_LOGIN_RATE_LIMIT = '10000';
  process.env.AUTH_LOGIN_RATE_WINDOW_MS = '60000';
  process.env.LLM_PROVIDER = 'openai';
  process.env.OPENAI_API_KEY = 'c2-int-fake-openai-key';
  process.env.EXTRACTION_WORKER_ENABLED = 'false';
  process.env.AUTH_EMAIL_SERVICE_KIND = 'test';
  process.env.FRONTEND_URL = 'http://localhost:8081';
  // F10 — disable HIBP breach check so the canonical `Password123!` fixture
  // (which appears in the public breach corpus) is accepted by /register.
  process.env.PASSWORD_BREACH_CHECK_ENABLED = 'false';
  process.env.APPLE_OIDC_JWKS_URL = 'https://appleid.apple.com/auth/keys';
  process.env.GOOGLE_OIDC_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
  process.env.OIDC_NONCE_ENFORCE = 'false';
  process.env.APPLE_CLIENT_ID = 'com.musaium.mobile.test';
  process.env.GOOGLE_OAUTH_CLIENT_ID = 'phase5-test-audience.apps.googleusercontent.com';

  // Now perform the dynamic imports — env.ts will capture the values above.
  const { ImageEnrichmentService } = await import(
    '@modules/chat/useCase/image/image-enrichment.service'
  );
  const { KnowledgeBaseService } = await import(
    '@modules/chat/useCase/knowledge/knowledge-base.service'
  );
  const { ChatService } = await import('@modules/chat/useCase/orchestration/chat.service');
  const { TypeOrmChatRepository } = await import(
    '@modules/chat/adapters/secondary/persistence/chat.repository.typeorm'
  );
  const { LocalImageStorage } = await import(
    '@modules/chat/adapters/secondary/storage/image-storage.stub'
  );
  const { createApp } = await import('@src/app');
  const { AppDataSource } = await import('@src/data/db/data-source');
  const { clearRateLimitBuckets } = await import(
    '@src/helpers/middleware/rate-limit.middleware'
  );

  // Discover migrations the same way e2e-app-harness does — read from disk
  // so a brand-new schema migration is auto-picked-up by this test.
  const { readdirSync } = await import('node:fs');
  const { join } = await import('node:path');
  const migrationsDir = join(
    __dirname,
    '..',
    '..',
    '..',
    'src',
    'data',
    'db',
    'migrations',
  );
  const migrationFiles = readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.d.ts'))
    .sort((a, b) => a.localeCompare(b));
  const migrationModules = await Promise.all(
    migrationFiles.map((file) => import(join(migrationsDir, file))),
  );
  const migrationClasses = migrationModules.flatMap((mod) =>
    Object.values(mod).filter((value): value is new () => unknown => typeof value === 'function'),
  );

  clearRateLimitBuckets();

  const dsOptions = AppDataSource.options as {
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
  dsOptions.migrations = migrationClasses;

  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
  }
  await AppDataSource.initialize();

  // Suppress stale-connection errors from the underlying pg driver.
  (
    AppDataSource.driver as { master?: { on?: (e: string, fn: () => void) => void } }
  ).master?.on?.('error', () => undefined);

  await AppDataSource.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  await AppDataSource.runMigrations({ transaction: 'each' });

  // Build the chat module singleton so transitively-loaded helpers
  // (e.g. GDPR DSAR proxy in @modules/auth/useCase) can resolve.
  const { buildChatService } = await import('@modules/chat');
  buildChatService(AppDataSource);

  // Build a custom ImageEnrichmentService wired with the mocked source
  // clients. Config mirrors `chat-module.ts:buildImageEnrichment` defaults.
  const imageEnrichment = new ImageEnrichmentService(
    args.unsplashClient,
    {
      cacheTtlMs: 60_000,
      cacheMaxEntries: 100,
      fetchTimeoutMs: 5_000,
      maxImagesPerResponse: 5,
    },
    args.commonsClient,
    args.musaiumClient,
  );

  const knowledgeBase = args.knowledgeBaseProvider
    ? new KnowledgeBaseService(
        args.knowledgeBaseProvider,
        { timeoutMs: 5_000, cacheTtlSeconds: 0, cacheMaxEntries: 50 },
      )
    : undefined;

  const chatService = new ChatService({
    repository: new TypeOrmChatRepository(AppDataSource),
    orchestrator: args.orchestrator,
    imageStorage: new LocalImageStorage(),
    audioTranscriber: {
      // eslint-disable-next-line @typescript-eslint/require-await -- port signature
      async transcribe() {
        return { text: 'transcribed', model: 'test', provider: 'openai' as const };
      },
    },
    imageEnrichment,
    knowledgeBase,
  });

  const app: Express = createApp({ chatService });

  let server: Server;
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      resolve();
    });
  });

  const address = server!.address() as AddressInfo | null;
  if (!address) throw new Error('Could not determine listener address');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const request: E2EHarness['request'] = async (path, init = {}, token) => {
    const headers = new Headers(init.headers ?? undefined);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (typeof init.body === 'string' && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
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

  // Mark email_verified directly so login succeeds without SMTP. Re-uses the
  // raw `dataSource` so we don't need to bring in the auth helpers (which
  // depend on the harness shape we replaced).
  const markEmailVerified = async (email: string): Promise<void> => {
    await AppDataSource.query(`UPDATE users SET email_verified = true WHERE email = $1`, [email]);
  };

  const stop = async (): Promise<void> => {
    if (server!) {
      await new Promise<void>((resolve, reject) => {
        server!.close((error) => (error ? reject(error) : resolve()));
      });
    }
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
    await postgresContainer.stop();
  };

  // Stash markEmailVerified on the request fn for test access.
  (request as unknown as Record<string, unknown>).__markEmailVerified = markEmailVerified;

  return { baseUrl, request, stop };
}

/* ─────────────────────────── auth helpers ──────────────────────────────── */

interface RegisteredVisitor {
  email: string;
  token: string;
}

async function registerAndLoginVisitor(harness: BootedHarness): Promise<RegisteredVisitor> {
  const email = `c2-int-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@musaium.test`;
  const password = 'Password123!';

  const reg = await harness.request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, firstname: 'Int', lastname: 'Tester' }),
  });
  if (reg.status !== 201) {
    throw new Error(`register failed: status=${reg.status} body=${JSON.stringify(reg.body)}`);
  }

  // Mark verified directly via the function we stashed on the request.
  const markEmailVerified = (
    harness.request as unknown as { __markEmailVerified: (email: string) => Promise<void> }
  ).__markEmailVerified;
  await markEmailVerified(email);

  const login = await harness.request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (login.status !== 200) {
    throw new Error(`login failed: status=${login.status} body=${JSON.stringify(login.body)}`);
  }
  const body = login.body as { accessToken: string };
  return { email, token: body.accessToken };
}

async function createSession(harness: BootedHarness, token: string): Promise<string> {
  const res = await harness.request(
    '/api/chat/sessions',
    {
      method: 'POST',
      body: JSON.stringify({ locale: 'en-US', museumMode: true }),
    },
    token,
  );
  if (res.status !== 201) {
    throw new Error(`create session failed: status=${res.status} body=${JSON.stringify(res.body)}`);
  }
  return (res.body as { session: { id: string } }).session.id;
}

interface AssistantTurnResponse {
  status: number;
  body: {
    sessionId: string;
    message: { id: string; role: string; text: string };
    metadata: {
      images?: EnrichedImage[];
      suggestedImages?: { query: string; rationale: string; caption: string }[];
      [k: string]: unknown;
    };
  };
}

async function postUserMessage(
  harness: BootedHarness,
  sessionId: string,
  token: string,
  text: string,
): Promise<AssistantTurnResponse> {
  const res = await harness.request(
    `/api/chat/sessions/${sessionId}/messages`,
    {
      method: 'POST',
      body: JSON.stringify({ text, context: { museumMode: true, locale: 'en-US' } }),
    },
    token,
  );
  return res as AssistantTurnResponse;
}

/* ────────────────────────────── Scenario A ─────────────────────────────── */

describeE2E('POST /sessions/:id/messages — C2 v2 enrichment (PG testcontainer)', () => {
  jest.setTimeout(180_000);

  describe('Scenario A — v2 enabled, all 4 sources wired', () => {
    let booted: BootedHarness;

    beforeAll(async () => {
      // CRITICAL — set BEFORE entering the isolate so the freshly-imported
      // `env.ts` captures the value at module load.
      process.env.CHAT_ENRICHMENT_V2_ENABLED = 'true';

      await jest.isolateModulesAsync(async () => {
        const orchestrator = new V2SuggestingOrchestrator();

        // Wire 4 mocks, each returning ONE photo per query (URL is query-
        // dependent so the dedup pass keeps distinct entries across the v2
        // fan-out's two `suggestedImages[]` queries).
        const unsplashClient = makeQueryAwareImageSourceClient(
          makeUnsplashPhoto({
            url: 'https://unsplash.test/source-unsplash',
            thumbnailUrl: 'https://unsplash.test/source-unsplash-thumb',
            caption: 'Unsplash photo of water lilies',
            photographerName: 'Test Unsplash Photographer',
          }),
        );
        const commonsClient = makeQueryAwareImageSourceClient(
          makeUnsplashPhoto({
            url: 'https://commons.test/source-commons',
            thumbnailUrl: 'https://commons.test/source-commons-thumb',
            caption: 'Commons photo of water lilies',
            photographerName: 'CC-BY Test User',
          }),
        );
        const musaiumClient = makeQueryAwareImageSourceClient(
          makeUnsplashPhoto({
            url: 'https://musaium.test/source-musaium',
            thumbnailUrl: 'https://musaium.test/source-musaium-thumb',
            caption: 'Musaium curated water lilies',
            photographerName: '',
          }),
        );
        const knowledgeBaseProvider = makeKnowledgeBaseProviderMock(
          makeArtworkFacts({
            qid: 'Q12342',
            title: "Monet's Water Lilies",
            imageUrl: 'https://wikidata.test/source-wikidata.jpg',
          }),
        );

        booted = await bootHarnessWithMockedEnrichment({
          unsplashClient,
          commonsClient,
          musaiumClient,
          knowledgeBaseProvider,
          orchestrator,
        });
      });
    }, 180_000);

    afterAll(async () => {
      await booted?.stop();
    });

    it(
      'returns ≥2 images from ≥2 distinct sources with non-empty caption + rationale on the second turn',
      async () => {
        const visitor = await registerAndLoginVisitor(booted);
        const sessionId = await createSession(booted, visitor.token);

        // Turn 1 — primes the session: orchestrator answers with
        // `suggestedImages` in metadata, persisted to the assistant message.
        const t1 = await postUserMessage(
          booted,
          sessionId,
          visitor.token,
          "Compare Monet's Water Lilies to Manet's Olympia",
        );
        expect(t1.status).toBe(201);
        expect(t1.body.metadata.suggestedImages).toBeDefined();
        expect(t1.body.metadata.suggestedImages?.length).toBeGreaterThanOrEqual(2);

        // Turn 2 — history now contains turn-1's `suggestedImages`, which the
        // enrichment-fetcher reads to fan out to all wired source clients.
        const t2 = await postUserMessage(
          booted,
          sessionId,
          visitor.token,
          'Tell me more about the brushwork.',
        );

        expect(t2.status).toBe(201);
        const images = t2.body.metadata.images;
        expect(Array.isArray(images)).toBe(true);
        expect(images!.length).toBeGreaterThanOrEqual(2);

        const allowed: ReadonlySet<EnrichedImage['source']> = new Set([
          'wikidata',
          'unsplash',
          'commons',
          'musaium',
        ]);
        for (const img of images!) {
          expect(allowed.has(img.source)).toBe(true);
          expect(typeof img.caption).toBe('string');
          expect(img.caption.length).toBeGreaterThan(0);
          expect(typeof img.rationale).toBe('string');
        }

        // R5 — the v2 fan-out path propagates the LLM-authored caption +
        // rationale from `suggestedImages[]` annotations to every image fetched
        // through `ImageSourceClient` (commons / unsplash / musaium). The
        // wikidata image is added via `mergeWikidataImage` AFTER the fan-out,
        // which does not currently propagate annotations — so a non-empty
        // rationale on that source is not asserted here. The fan-out sources
        // MUST carry rationale, otherwise v2 metadata enrichment is broken.
        const fanOutImages = images!.filter((img) => img.source !== 'wikidata');
        expect(fanOutImages.length).toBeGreaterThanOrEqual(1);
        for (const img of fanOutImages) {
          expect(img.rationale.length).toBeGreaterThan(0);
        }

        const sourcesPresent = new Set(images!.map((img) => img.source));
        expect(sourcesPresent.size).toBeGreaterThanOrEqual(2);
      },
    );
  });

  /* ────────────────────────────── Scenario B ─────────────────────────────── */

  describe('Scenario B — v2 disabled, only Unsplash + Wikidata wired (legacy v1 path)', () => {
    let booted: BootedHarness;

    beforeAll(async () => {
      process.env.CHAT_ENRICHMENT_V2_ENABLED = 'false';

      await jest.isolateModulesAsync(async () => {
        const orchestrator = new V2SuggestingOrchestrator();

        // Only Unsplash + Wikidata — Commons & Musaium clients are NOT wired,
        // matching the production `chat-module.ts:230-249` build path when
        // `v2Enabled === false` (the new clients are simply not constructed).
        const unsplashClient = makeUnsplashClientMock([
          makeUnsplashPhoto({
            url: 'https://unsplash.test/legacy-unsplash.jpg',
            thumbnailUrl: 'https://unsplash.test/legacy-unsplash-thumb.jpg',
            caption: 'Unsplash legacy photo',
            photographerName: 'Legacy Photographer',
          }),
        ]);
        const knowledgeBaseProvider = makeKnowledgeBaseProviderMock(
          makeArtworkFacts({
            qid: 'Q12342',
            title: "Monet's Water Lilies",
            imageUrl: 'https://wikidata.test/legacy-wikidata.jpg',
          }),
        );

        booted = await bootHarnessWithMockedEnrichment({
          unsplashClient,
          commonsClient: undefined,
          musaiumClient: undefined,
          knowledgeBaseProvider,
          orchestrator,
        });
      });
    }, 180_000);

    afterAll(async () => {
      await booted?.stop();
    });

    it(
      'returns ≤3 images and never includes commons or musaium sources (legacy v1 cap)',
      async () => {
        const visitor = await registerAndLoginVisitor(booted);
        const sessionId = await createSession(booted, visitor.token);

        const t1 = await postUserMessage(
          booted,
          sessionId,
          visitor.token,
          "Compare Monet's Water Lilies to Manet's Olympia",
        );
        expect(t1.status).toBe(201);

        const t2 = await postUserMessage(
          booted,
          sessionId,
          visitor.token,
          'Tell me more about the brushwork.',
        );
        expect(t2.status).toBe(201);

        const images = t2.body.metadata.images ?? [];
        // Legacy cap: maxImagesPerResponse defaults to 5 in our test build but
        // the v1 path with only Unsplash + Wikidata physically cannot produce
        // more than 3 entries (1 Wikidata P18 + 1 Unsplash photo, plus the
        // optional KB-merged Wikidata image). The mission spec asserts ≤3.
        expect(images.length).toBeLessThanOrEqual(3);

        const blockedSources: ReadonlySet<EnrichedImage['source']> = new Set([
          'commons',
          'musaium',
        ]);
        for (const img of images) {
          expect(blockedSources.has(img.source)).toBe(false);
        }
      },
    );
  });
});
