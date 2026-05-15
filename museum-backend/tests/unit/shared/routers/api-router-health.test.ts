/**
 * Stryker survivor + NoCoverage kill suite for
 * `src/shared/routers/api.router.ts` — focuses on the `/health` handler,
 * route-path string literals, DI fallback logic, and the
 * `resolveEnrichMuseumUseCase` cache path.
 *
 * All sub-routers and external wiring are mocked. The env module is replaced
 * with a mutable object so each test can flip provider / API keys / nodeEnv
 * without rebuilding the module graph (the router reads `env.*` at request
 * time, not import time).
 */
import express from 'express';
import request from 'supertest';

// ─── Mutable env mock ─────────────────────────────────────────────────────
// The router accesses `env.llm.*`, `env.nodeEnv`, `env.commitSha`,
// `env.appVersion`, `env.extractionWorkerEnabled` lazily inside the
// `/health` handler / mountDomainRouters. Exposing a mutable object lets a
// single test file exercise multiple permutations.
const envMock: {
  nodeEnv: string;
  appVersion: string;
  commitSha: string | undefined;
  extractionWorkerEnabled: boolean;
  llm: {
    provider: 'openai' | 'deepseek' | 'google';
    openAiApiKey: string | undefined;
    deepseekApiKey: string | undefined;
    googleApiKey: string | undefined;
  };
  redis: { host: string; port: number; password: string | undefined };
} = {
  nodeEnv: 'test',
  appVersion: '0.0.0-test',
  commitSha: 'abc1234',
  extractionWorkerEnabled: false,
  llm: {
    provider: 'openai',
    openAiApiKey: 'sk-test',
    deepseekApiKey: undefined,
    googleApiKey: undefined,
  },
  redis: { host: 'localhost', port: 6379, password: undefined },
};

jest.mock('@src/config/env', () => ({
  get env() {
    return envMock;
  },
}));

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// ─── Sub-router stubs (each mounts a `/__probe` GET so we can verify the
// mount-path string literals via supertest) ───────────────────────────────
const makeProbeRouter = (label: string) => {
  const { Router } = jest.requireActual<typeof import('express')>('express');
  const r = Router();
  r.get('/__probe', (_req, res) => {
    res.status(200).json({ label });
  });
  return r;
};

jest.mock('@modules/admin/adapters/primary/http/routes/admin-ke.route', () => ({
  createAdminKeRouter: jest.fn(() => makeProbeRouter('admin-ke')),
}));
jest.mock('@modules/admin/adapters/primary/http/routes/admin.route', () => ({
  __esModule: true,
  default: (() => {
    const { Router } = jest.requireActual<typeof import('express')>('express');
    const r = Router();
    r.get('/__probe', (_req, res) => {
      res.status(200).json({ label: 'admin' });
    });
    return r;
  })(),
}));
jest.mock('@modules/admin/adapters/primary/http/routes/cache-purge.route', () => ({
  createCachePurgeRouter: jest.fn(() => makeProbeRouter('cache-purge')),
}));
jest.mock('@modules/auth/adapters/primary/http/routes/auth.route', () => ({
  __esModule: true,
  default: (() => {
    const { Router } = jest.requireActual<typeof import('express')>('express');
    const r = Router();
    r.get('/__probe', (_req, res) => {
      res.status(200).json({ label: 'auth' });
    });
    return r;
  })(),
}));
jest.mock('@modules/auth/adapters/primary/http/routes/consent.route', () => ({
  __esModule: true,
  default: (() => {
    const { Router } = jest.requireActual<typeof import('express')>('express');
    const r = Router();
    r.get('/__probe', (_req, res) => {
      res.status(200).json({ label: 'consent' });
    });
    return r;
  })(),
}));
jest.mock('@modules/auth/adapters/primary/http/routes/me.route', () => ({
  __esModule: true,
  default: (() => {
    const { Router } = jest.requireActual<typeof import('express')>('express');
    const r = Router();
    r.get('/__probe', (_req, res) => {
      res.status(200).json({ label: 'me' });
    });
    return r;
  })(),
}));
jest.mock('@modules/auth/adapters/primary/http/routes/mfa.route', () => ({
  __esModule: true,
  default: (() => {
    const { Router } = jest.requireActual<typeof import('express')>('express');
    const r = Router();
    r.get('/__probe', (_req, res) => {
      res.status(200).json({ label: 'mfa' });
    });
    return r;
  })(),
}));
// R2 W3.4 — `admin-export.route` imports `authenticated.middleware` which
// transitively pulls `auth/useCase` → `AppDataSource`. Same env.db.host trap
// as me.route / mfa.route — stub the router out (mirrors corrective in
// api-router-resolve.test.ts).
jest.mock('@modules/admin/adapters/primary/http/routes/admin-export.route', () => ({
  __esModule: true,
  default: (() => {
    const { Router } = jest.requireActual<typeof import('express')>('express');
    const r = Router();
    r.get('/__probe', (_req, res) => {
      res.status(200).json({ label: 'admin-export' });
    });
    return r;
  })(),
}));
// R1 C6 + R3/R4 — `leads.route` imports `leads/useCase/index.ts` which
// eagerly reads `env` at module load (composition root for submitBeta/
// submitB2bLead/submitPaywallInterest useCases). The test's `get env()`
// returns `envMock` which isn't initialized yet at module-load time, so we
// stub the router out (same pattern as me.route / mfa.route / admin-export).
jest.mock('@modules/leads/adapters/primary/http/routes/leads.route', () => ({
  __esModule: true,
  default: (() => {
    const { Router } = jest.requireActual<typeof import('express')>('express');
    const r = Router();
    r.get('/__probe', (_req, res) => {
      res.status(200).json({ label: 'leads' });
    });
    return r;
  })(),
}));
jest.mock('@modules/chat/adapters/primary/http/routes/chat.route', () => ({
  createChatRouter: jest.fn(() => makeProbeRouter('chat')),
}));

const getLlmCircuitBreakerStateMock = jest.fn<
  { state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' } | undefined,
  []
>();
const getLlmGuardCircuitBreakerStateMock = jest.fn<
  { state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' } | undefined,
  []
>();
// `getActiveChatModule` is the shallow entry point that wiring.ts delegates
// every accessor through. Replacing it with a fixed isBuilt=false handle
// lets the REAL wiring code run unchanged — every accessor flows through
// `isBuilt() === false` and returns undefined exactly like the production
// boot-order-tolerant path. Test-controlled overrides:
//   - `isBuilt` flips per test (default false) for the artwork-knowledge-repo
//     branch in api.router.ts (`if (artworkKnowledgeRepo) router.use(...)`).
//   - `getBuilt().artworkKnowledgeRepo` is the only Built field the suite
//     reads — exposing it keeps the truthy branch reachable without
//     materialising the rest of the BuiltChatModule.
//   - `getLlmCircuitBreakerState` is module-private state on the singleton,
//     mocked here so tests can flip cbState=undefined / 'CLOSED' / 'OPEN'.
//
// No catch-all `() => undefined` stubs: future additions to `wiring.ts`
// (`getXxx` accessors that delegate to `getActiveChatModule()`) work out
// of the box because the real wiring code runs end-to-end.
// Default `isBuilt=true` keeps the artwork-knowledge-repo branch active so
// the suite's happy-path mount of `createAdminKeRouter` triggers without
// per-test setup; the one test that exercises the falsy branch flips it
// via `artworkKnowledgeRepoOverride.mockReturnValueOnce(undefined)`. Every
// other Built field is `undefined` (object literal omits them) so the
// wiring accessors for compareImageUseCase, compareSessionAccessVerifier,
// describeService, etc. all return undefined just like the production
// boot-order-tolerant path.
const isBuiltMock = jest.fn<boolean, []>(() => true);
const artworkKnowledgeRepoOverride = jest.fn<unknown, []>(() => ({}) as object);

jest.mock('@modules/chat/chat-module', () => {
  const built = {
    get artworkKnowledgeRepo() {
      return artworkKnowledgeRepoOverride();
    },
  };
  return {
    getActiveChatModule: () => ({
      isBuilt: () => isBuiltMock(),
      getBuilt: () => built,
      getLlmCircuitBreakerState: () => getLlmCircuitBreakerStateMock(),
      getLlmGuardCircuitBreakerState: () => getLlmGuardCircuitBreakerStateMock(),
    }),
    setActiveChatModule: () => {},
    resetActiveChatModule: () => {},
    // Runtime accessors previously from chat-module.wiring — these match the
    // boot-order-tolerant path: undefined when not built, undefined per missing
    // field on the built shape.
    getImageStorage: () => ({}) as unknown,
    getChatRepository: () => ({}) as unknown,
    getUserMemoryService: () => undefined,
    getArtKeywordRepository: () => undefined,
    getDescribeService: () => undefined,
    getLlmCircuitBreakerState: () => getLlmCircuitBreakerStateMock(),
    getLlmGuardCircuitBreakerState: () => getLlmGuardCircuitBreakerStateMock(),
    getArtworkKnowledgeRepo: () => (isBuiltMock() ? artworkKnowledgeRepoOverride() : undefined),
    getCompareImageUseCase: () => undefined,
    getCompareSessionAccessVerifier: () => undefined,
    // Phase 1 (perennial design): GDPR Art. 22 explanation use-case accessor.
    // Tests don't exercise the /messages/:id/explanation route so a stub is OK.
    getMessageExplanationUseCase: () => undefined,
  };
});
jest.mock('@modules/daily-art', () => ({
  createDailyArtRouter: jest.fn(() => makeProbeRouter('daily-art')),
}));
jest.mock('@modules/museum', () => ({
  buildEnrichMuseumUseCase: jest.fn(() => ({}) as object),
  buildLowDataPackService: jest.fn(() => ({}) as object),
}));
jest.mock('@modules/museum/adapters/primary/http/routes/low-data-pack.route', () => ({
  createLowDataPackRouter: jest.fn(() => makeProbeRouter('low-data-pack')),
}));
jest.mock('@modules/museum/adapters/primary/http/routes/museum.route', () => ({
  createMuseumRouter: jest.fn(() => makeProbeRouter('museum')),
}));
const bullmqCtor = jest.fn();
jest.mock(
  '@modules/museum/adapters/secondary/enrichment/bullmq-museum-enrichment-queue.adapter',
  () => ({
    BullmqMuseumEnrichmentQueueAdapter: jest.fn().mockImplementation((...args: unknown[]) => {
      bullmqCtor(...args);
      return {} as object;
    }),
  }),
);
jest.mock('@modules/review/adapters/primary/http/routes/review.route', () => ({
  __esModule: true,
  default: (() => {
    const { Router } = jest.requireActual<typeof import('express')>('express');
    const r = Router();
    r.get('/__probe', (_req, res) => {
      res.status(200).json({ label: 'reviews' });
    });
    return r;
  })(),
}));
jest.mock('@modules/support/adapters/primary/http/routes/support.route', () => ({
  __esModule: true,
  default: (() => {
    const { Router } = jest.requireActual<typeof import('express')>('express');
    const r = Router();
    r.get('/__probe', (_req, res) => {
      res.status(200).json({ label: 'support' });
    });
    return r;
  })(),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────
import { createApiRouter, buildHealthPayload } from '@shared/routers/api.router';
import { NoopCacheService } from '@shared/cache/noop-cache.service';
import { createAdminKeRouter } from '@modules/admin/adapters/primary/http/routes/admin-ke.route';
import { createCachePurgeRouter } from '@modules/admin/adapters/primary/http/routes/cache-purge.route';
import { createChatRouter } from '@modules/chat/adapters/primary/http/routes/chat.route';
import { createDailyArtRouter } from '@modules/daily-art';
import { buildLowDataPackService, buildEnrichMuseumUseCase } from '@modules/museum';
import { createMuseumRouter } from '@modules/museum/adapters/primary/http/routes/museum.route';
import { BullmqMuseumEnrichmentQueueAdapter } from '@modules/museum/adapters/secondary/enrichment/bullmq-museum-enrichment-queue.adapter';

import type { ChatService } from '@modules/chat/useCase/orchestration/chat.service';
import type { CacheService } from '@shared/cache/cache.port';

// ─── Helpers ──────────────────────────────────────────────────────────────
const resetEnv = () => {
  envMock.nodeEnv = 'test';
  envMock.appVersion = '0.0.0-test';
  envMock.commitSha = 'abc1234';
  envMock.extractionWorkerEnabled = false;
  envMock.llm.provider = 'openai';
  envMock.llm.openAiApiKey = 'sk-test';
  envMock.llm.deepseekApiKey = undefined;
  envMock.llm.googleApiKey = undefined;
};

const buildApp = (deps: {
  chatService?: ChatService;
  healthCheck?: () => Promise<{ database: 'up' | 'down' }>;
  cacheService?: CacheService;
}) => {
  const app = express();
  app.use(
    '/api',
    createApiRouter({
      chatService: deps.chatService ?? ({} as ChatService),
      healthCheck: deps.healthCheck ?? jest.fn().mockResolvedValue({ database: 'up' as const }),
      cacheService: deps.cacheService,
    }),
  );
  return app;
};

// Build a fake CacheService that is NOT a NoopCacheService instance (kills
// the `cacheService instanceof NoopCacheService` mutants on L143).
const makeRedisLikeCache = (ping: () => Promise<boolean> | Promise<never>): CacheService =>
  ({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
    delByPrefix: jest.fn().mockResolvedValue(undefined),
    setNx: jest.fn().mockResolvedValue(true),
    incrBy: jest.fn().mockResolvedValue(null),
    ping: jest.fn().mockImplementation(ping),
    zadd: jest.fn().mockResolvedValue(undefined),
    ztop: jest.fn().mockResolvedValue([]),
  }) as unknown as CacheService;

describe('createApiRouter — /health route', () => {
  beforeEach(() => {
    resetEnv();
    jest.clearAllMocks();
    getLlmCircuitBreakerStateMock.mockReturnValue({ state: 'CLOSED' });
  });

  // ── Route path (L139) + Cache-Control header (L140) ────────────────────
  it('mounts the health route at /health and sets a public Cache-Control', async () => {
    const app = buildApp({});
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=10, s-maxage=10');
    expect(res.body.status).toBe('ok');
    expect(res.body.checks.database).toBe('up');
  });

  it('404s on the empty path mutation (no route registered at root)', async () => {
    // Sanity guard: confirms /api responds 404 when no sub-path is given,
    // so the `/health` literal mutation (→ "") would shift routing.
    const app = buildApp({});
    const res = await request(app).get('/api');
    expect(res.status).toBe(404);
  });

  // ── isNoop branch (L143) ───────────────────────────────────────────────
  it('skips redis ping when no cacheService is injected (isNoop=true via !cacheService)', async () => {
    const app = buildApp({ cacheService: undefined });
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    // In non-prod, redis status surfaces in payload.
    expect(res.body.checks.redis).toBe('skipped');
  });

  it('skips redis ping when cacheService is a NoopCacheService instance', async () => {
    const noop = new NoopCacheService();
    const pingSpy = jest.spyOn(noop, 'ping');
    const app = buildApp({ cacheService: noop });
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.checks.redis).toBe('skipped');
    expect(pingSpy).not.toHaveBeenCalled();
  });

  // ── Ping resolves up / down (L150 arrow, L153 string) ──────────────────
  it('reports redis=up when ping resolves true', async () => {
    const cache = makeRedisLikeCache(() => Promise.resolve(true));
    const res = await request(buildApp({ cacheService: cache })).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.checks.redis).toBe('up');
  });

  it('reports redis=down when ping resolves false', async () => {
    const cache = makeRedisLikeCache(() => Promise.resolve(false));
    const res = await request(buildApp({ cacheService: cache })).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.checks.redis).toBe('down');
    expect(res.body.status).toBe('degraded');
  });

  // ── Race timeout (L151 arrow, L152 block, L153 string) ─────────────────
  it('reports redis=down when ping hangs past the race timeout', async () => {
    // Bypass supertest entirely for this case — supertest's internal HTTP
    // polling fights fake timers. We invoke the registered /health handler
    // directly on a mocked req/res pair so fake timers can deterministically
    // advance past REDIS_PING_TIMEOUT_MS without blocking on real sockets.
    jest.useFakeTimers();
    try {
      const cache = makeRedisLikeCache(() => new Promise<boolean>(() => undefined));
      const router = createApiRouter({
        chatService: {} as ChatService,
        healthCheck: jest.fn().mockResolvedValue({ database: 'up' as const }),
        cacheService: cache,
      });

      // Pull the /health handler out of the router stack. Express stores
      // routes on router.stack; the first GET on /health is what we want.
      const layers = (
        router as unknown as {
          stack: {
            route?: { path: string; stack: { method: string; handle: express.Handler }[] };
          }[];
        }
      ).stack;
      const healthLayer = layers.find((l) => l.route?.path === '/health');
      const handler = healthLayer?.route?.stack.find((s) => s.method === 'get')?.handle;
      if (!handler) {
        throw new Error('test setup: failed to locate /health handler');
      }

      const headers: Record<string, string> = {};
      let statusCode = 0;
      let body: Record<string, unknown> = {};
      const res = {
        set: (k: string, v: string) => {
          headers[k] = v;
          return res;
        },
        status: (s: number) => {
          statusCode = s;
          return res;
        },
        json: (j: Record<string, unknown>) => {
          body = j;
          return res;
        },
      };

      const pending = handler({} as express.Request, res as unknown as express.Response, jest.fn());

      // Flush pending microtasks then advance past REDIS_PING_TIMEOUT_MS.
      await Promise.resolve();
      await Promise.resolve();
      jest.advanceTimersByTime(2_001);

      await pending;

      expect(statusCode).toBe(200);
      expect(body.checks).toMatchObject({ redis: 'down' });
      expect(body.status).toBe('degraded');
      expect(headers['Cache-Control']).toBe('public, max-age=10, s-maxage=10');
    } finally {
      jest.useRealTimers();
    }
  });

  // ── Ping rejection caught (L156 arrow `.catch(() => 'down')`) ──────────
  it('reports redis=down when ping rejects (catch handler runs)', async () => {
    const cache = makeRedisLikeCache(() => Promise.reject(new Error('connect ECONNREFUSED')));
    const res = await request(buildApp({ cacheService: cache })).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.checks.redis).toBe('down');
    expect(res.body.status).toBe('degraded');
  });

  // ── responseTimeMs arithmetic (L159) ───────────────────────────────────
  it('returns a small non-negative responseTimeMs in non-prod', async () => {
    const res = await request(buildApp({})).get('/api/health');
    expect(res.body.responseTimeMs).toBeGreaterThanOrEqual(0);
    // Date.now() + start would be ≈ 2 × current epoch (>1e12). Cap at 10s.
    expect(res.body.responseTimeMs).toBeLessThan(10_000);
  });

  // ── llmConfigured triplet (L161-163) ───────────────────────────────────
  it('llmConfigured=true when provider=openai and openAiApiKey is set', async () => {
    envMock.llm.provider = 'openai';
    envMock.llm.openAiApiKey = 'sk-real';
    const res = await request(buildApp({})).get('/api/health');
    expect(res.body.checks.llmConfigured).toBe(true);
  });

  it('llmConfigured=false when provider=openai and openAiApiKey is missing', async () => {
    envMock.llm.provider = 'openai';
    envMock.llm.openAiApiKey = undefined;
    const res = await request(buildApp({})).get('/api/health');
    expect(res.body.checks.llmConfigured).toBe(false);
  });

  it('llmConfigured=true when provider=deepseek and deepseekApiKey is set', async () => {
    envMock.llm.provider = 'deepseek';
    envMock.llm.openAiApiKey = undefined;
    envMock.llm.deepseekApiKey = 'ds-real';
    const res = await request(buildApp({})).get('/api/health');
    expect(res.body.checks.llmConfigured).toBe(true);
  });

  it('llmConfigured=false when provider=deepseek and deepseekApiKey is missing', async () => {
    envMock.llm.provider = 'deepseek';
    envMock.llm.openAiApiKey = 'sk-other-provider-key'; // wrong provider's key
    envMock.llm.deepseekApiKey = undefined;
    const res = await request(buildApp({})).get('/api/health');
    expect(res.body.checks.llmConfigured).toBe(false);
  });

  it('llmConfigured=true when provider=google and googleApiKey is set', async () => {
    envMock.llm.provider = 'google';
    envMock.llm.openAiApiKey = undefined;
    envMock.llm.googleApiKey = 'g-real';
    const res = await request(buildApp({})).get('/api/health');
    expect(res.body.checks.llmConfigured).toBe(true);
  });

  it('llmConfigured=false when provider=google and googleApiKey is missing', async () => {
    envMock.llm.provider = 'google';
    envMock.llm.googleApiKey = undefined;
    envMock.llm.deepseekApiKey = 'wrong-provider-key';
    const res = await request(buildApp({})).get('/api/health');
    expect(res.body.checks.llmConfigured).toBe(false);
  });

  // ── ObjectLiteral on buildHealthPayload input (L168) ───────────────────
  it('passes structured checks (database + redis + circuit breaker) into buildHealthPayload', async () => {
    getLlmCircuitBreakerStateMock.mockReturnValue({ state: 'OPEN' });
    const cache = makeRedisLikeCache(() => Promise.resolve(true));
    const res = await request(buildApp({ cacheService: cache })).get('/api/health');

    expect(res.body.checks.database).toBe('up');
    expect(res.body.checks.redis).toBe('up');
    expect(res.body.checks.llmCircuitBreaker).toBe('OPEN');
  });

  // ── OptionalChaining on cbState?.state (L171) ──────────────────────────
  it('omits llmCircuitBreaker when getLlmCircuitBreakerState() returns undefined', async () => {
    getLlmCircuitBreakerStateMock.mockReturnValue(undefined);
    const res = await request(buildApp({})).get('/api/health');
    // Mutant `cbState.state` would throw on undefined → 500.
    expect(res.status).toBe(200);
    expect(res.body.checks.llmCircuitBreaker).toBeUndefined();
  });

  // ── R8 — llmGuard CB state surfaced in /health (additive 2026-05-12) ───
  // Mirrors the `llmCircuitBreaker` assertions above, applied to the new
  // sidecar breaker accessor (`getLlmGuardCircuitBreakerState`). Same
  // redaction posture as the existing breaker.
  it('passes llmGuard state into buildHealthPayload when getLlmGuardCircuitBreakerState() returns a state', async () => {
    getLlmGuardCircuitBreakerStateMock.mockReturnValue({ state: 'OPEN' });
    const res = await request(buildApp({})).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.checks.llmGuard).toBe('OPEN');
  });

  it('omits llmGuard when getLlmGuardCircuitBreakerState() returns undefined', async () => {
    getLlmGuardCircuitBreakerStateMock.mockReturnValue(undefined);
    const res = await request(buildApp({})).get('/api/health');
    // Mutant `guardCbState.state` would throw on undefined → 500.
    expect(res.status).toBe(200);
    expect(res.body.checks.llmGuard).toBeUndefined();
  });

  // ── responseTimeMs presence in non-prod vs prod (L177) ─────────────────
  it('includes responseTimeMs in non-production (env.nodeEnv=test)', async () => {
    envMock.nodeEnv = 'test';
    const res = await request(buildApp({})).get('/api/health');
    expect(res.body.responseTimeMs).toBeDefined();
    expect(typeof res.body.responseTimeMs).toBe('number');
  });

  it('omits responseTimeMs in production', async () => {
    envMock.nodeEnv = 'production';
    const res = await request(buildApp({})).get('/api/health');
    expect(res.body.responseTimeMs).toBeUndefined();
  });

  // ── DB-down 503 path (L181) ────────────────────────────────────────────
  it('returns HTTP 503 when database is down', async () => {
    const app = buildApp({
      healthCheck: jest.fn().mockResolvedValue({ database: 'down' as const }),
    });
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('degraded');
    expect(res.body.checks.database).toBe('down');
  });

  it('returns HTTP 200 when database is up', async () => {
    const app = buildApp({
      healthCheck: jest.fn().mockResolvedValue({ database: 'up' as const }),
    });
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

// ─── createApiRouter — sub-router mount paths (L235/243/247/248/253/255/261/263/264/269/270) ──
describe('createApiRouter — sub-router mount path literals', () => {
  beforeEach(() => {
    resetEnv();
    jest.clearAllMocks();
    getLlmCircuitBreakerStateMock.mockReturnValue({ state: 'CLOSED' });
  });

  const probe = async (app: express.Express, path: string) => {
    const res = await request(app).get(path);
    return res;
  };

  it('mounts the chat sub-router at /chat', async () => {
    const app = buildApp({});
    const res = await probe(app, '/api/chat/__probe');
    expect(res.status).toBe(200);
    expect(res.body.label).toBe('chat');
  });

  it('mounts the consent sub-router at /auth/consent', async () => {
    const res = await probe(buildApp({}), '/api/auth/consent/__probe');
    expect(res.status).toBe(200);
    expect(res.body.label).toBe('consent');
  });

  it('mounts the mfa sub-router at /auth/mfa BEFORE the catch-all auth router', async () => {
    const res = await probe(buildApp({}), '/api/auth/mfa/__probe');
    expect(res.status).toBe(200);
    expect(res.body.label).toBe('mfa');
  });

  it('mounts the auth sub-router at /auth', async () => {
    const res = await probe(buildApp({}), '/api/auth/__probe');
    expect(res.status).toBe(200);
    expect(res.body.label).toBe('auth');
  });

  it('mounts the users (me) sub-router at /users', async () => {
    const res = await probe(buildApp({}), '/api/users/__probe');
    expect(res.status).toBe(200);
    expect(res.body.label).toBe('me');
  });

  it('mounts the daily-art sub-router at /daily-art', async () => {
    const res = await probe(buildApp({}), '/api/daily-art/__probe');
    expect(res.status).toBe(200);
    expect(res.body.label).toBe('daily-art');
  });

  it('mounts the museum sub-router at /museums', async () => {
    const res = await probe(buildApp({}), '/api/museums/__probe');
    expect(res.status).toBe(200);
    expect(res.body.label).toBe('museum');
  });

  it('mounts the low-data-pack sub-router at /', async () => {
    const res = await probe(buildApp({}), '/api/__probe');
    expect(res.status).toBe(200);
    expect(res.body.label).toBe('low-data-pack');
  });

  it('mounts the admin sub-router at /admin (admin route reachable)', async () => {
    const res = await probe(buildApp({}), '/api/admin/__probe');
    expect(res.status).toBe(200);
    // Either admin or cache-purge probe matches — both mounted under /admin.
    expect(['admin', 'cache-purge', 'admin-ke']).toContain(res.body.label);
  });

  it('mounts the support sub-router at /support', async () => {
    const res = await probe(buildApp({}), '/api/support/__probe');
    expect(res.status).toBe(200);
    expect(res.body.label).toBe('support');
  });

  it('mounts the reviews sub-router at /reviews', async () => {
    const res = await probe(buildApp({}), '/api/reviews/__probe');
    expect(res.status).toBe(200);
    expect(res.body.label).toBe('reviews');
  });
});

// ─── createApiRouter — DI behavior (L256 ObjectLiteral, L259 ??, L266 cond) ─
describe('createApiRouter — dependency injection wiring', () => {
  beforeEach(() => {
    resetEnv();
    jest.clearAllMocks();
    getLlmCircuitBreakerStateMock.mockReturnValue({ state: 'CLOSED' });
  });

  it('forwards both cacheService and enrichMuseumUseCase keys to createMuseumRouter', () => {
    const cache = new NoopCacheService();
    buildApp({ cacheService: cache });

    expect(createMuseumRouter).toHaveBeenCalledTimes(1);
    const deps = (createMuseumRouter as jest.Mock).mock.calls[0]?.[0] as {
      cacheService: unknown;
      enrichMuseumUseCase: unknown;
    };
    // Mutant `{}` for the ObjectLiteral would have neither key.
    expect(deps).toHaveProperty('cacheService');
    expect(deps).toHaveProperty('enrichMuseumUseCase');
    expect(deps.cacheService).toBe(cache);
  });

  it('falls back to NoopCacheService when no cacheService is provided (?? operator)', () => {
    buildApp({ cacheService: undefined });

    // buildLowDataPackService must receive a non-undefined NoopCacheService.
    // Mutant `cacheService && new NoopCacheService()` would pass undefined.
    expect(buildLowDataPackService).toHaveBeenCalledTimes(1);
    const firstArg = (buildLowDataPackService as jest.Mock).mock.calls[0]?.[0];
    expect(firstArg).toBeInstanceOf(NoopCacheService);
  });

  it('forwards the injected cacheService into buildLowDataPackService when provided', () => {
    const cache = new NoopCacheService();
    buildApp({ cacheService: cache });
    const firstArg = (buildLowDataPackService as jest.Mock).mock.calls[0]?.[0];
    expect(firstArg).toBe(cache);
  });

  it('passes the injected cacheService into createDailyArtRouter', () => {
    const cache = new NoopCacheService();
    buildApp({ cacheService: cache });
    expect(createDailyArtRouter).toHaveBeenCalledWith(cache);
  });

  it('passes the resolved cacheService into createCachePurgeRouter', () => {
    const cache = new NoopCacheService();
    buildApp({ cacheService: cache });
    expect(createCachePurgeRouter).toHaveBeenCalledWith(cache);
  });

  it('passes the chat-wiring dependencies into createChatRouter', () => {
    const chatService = { sentinel: true } as unknown as ChatService;
    buildApp({ chatService });
    expect(createChatRouter).toHaveBeenCalledTimes(1);
    // Mutant on the chat path string would prevent any /api/chat/* mounting
    // even though the factory still ran; behavior is covered by the
    // mount-path suite. Here we just lock the factory contract.
    expect((createChatRouter as jest.Mock).mock.calls[0]?.[0]).toBe(chatService);
  });

  it('mounts createAdminKeRouter only when artworkKnowledgeRepo is truthy (L266 cond)', () => {
    buildApp({});
    expect(createAdminKeRouter).toHaveBeenCalledTimes(1);
  });

  it('skips createAdminKeRouter when artworkKnowledgeRepo is undefined', () => {
    artworkKnowledgeRepoOverride.mockReturnValueOnce(undefined);
    buildApp({});
    expect(createAdminKeRouter).not.toHaveBeenCalled();
  });
});

// ─── resolveEnrichMuseumUseCase cache path (L204-L226) ────────────────────
// `cachedEnrichUseCase` is a module-level singleton, so each test in this
// suite re-isolates the router module via `jest.isolateModules` to get a
// fresh cache. We re-apply the env + sub-router mocks inside the isolated
// context — top-level `jest.mock` registrations persist across
// isolateModules (they're auto-hoisted) so the doubles stay in place.
describe('resolveEnrichMuseumUseCase — caching + worker-enabled paths', () => {
  beforeEach(() => {
    resetEnv();
    jest.clearAllMocks();
    getLlmCircuitBreakerStateMock.mockReturnValue({ state: 'CLOSED' });
  });

  const loadIsolatedRouter = (): typeof createApiRouter => {
    let factory: typeof createApiRouter | undefined;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- isolateModules requires sync require to bind to the freshly evaluated module
      const mod = require('@shared/routers/api.router') as {
        createApiRouter: typeof createApiRouter;
      };
      factory = mod.createApiRouter;
    });
    if (!factory) {
      throw new Error('test setup: failed to reload api.router');
    }
    return factory;
  };

  const buildIsolated = (factory: typeof createApiRouter) => {
    const app = express();
    app.use(
      '/api',
      factory({
        chatService: {} as ChatService,
        healthCheck: jest.fn().mockResolvedValue({ database: 'up' as const }),
      }),
    );
    return app;
  };

  it('instantiates BullmqMuseumEnrichmentQueueAdapter only on the FIRST call (cache hit on L205)', () => {
    envMock.extractionWorkerEnabled = true;
    const factory = loadIsolatedRouter();

    buildIsolated(factory);
    buildIsolated(factory);

    // L205 conditional: on the 2nd call the cache short-circuits before the
    // adapter is rebuilt. Mutant `cachedEnrichUseCase === undefined` (true
    // branch always re-runs) would call the constructor twice.
    expect(BullmqMuseumEnrichmentQueueAdapter).toHaveBeenCalledTimes(1);
    expect(bullmqCtor).toHaveBeenCalledTimes(1);
    expect(buildEnrichMuseumUseCase).toHaveBeenCalledTimes(1);
  });

  it('passes redis host/port/password to the BullMQ adapter', () => {
    envMock.extractionWorkerEnabled = true;
    envMock.redis.host = 'redis.example';
    envMock.redis.port = 16379;
    envMock.redis.password = 'shh';
    const factory = loadIsolatedRouter();

    buildIsolated(factory);

    expect(bullmqCtor).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'redis.example',
        port: 16379,
        password: 'shh',
        maxRetriesPerRequest: null,
        enableOfflineQueue: false,
      }),
    );

    // Restore for any later tests sharing the env mock.
    envMock.redis.host = 'localhost';
    envMock.redis.port = 6379;
    envMock.redis.password = undefined;
  });

  it('catches BullMQ adapter construction errors and falls back to undefined', () => {
    envMock.extractionWorkerEnabled = true;

    // First failure should be cached as null → no second construction attempt.
    (BullmqMuseumEnrichmentQueueAdapter as jest.Mock).mockImplementationOnce(() => {
      throw new Error('connect ECONNREFUSED');
    });

    const factory = loadIsolatedRouter();
    buildIsolated(factory);
    buildIsolated(factory);

    // Construction attempted once on the failure, then cached as null on retry.
    expect(BullmqMuseumEnrichmentQueueAdapter).toHaveBeenCalledTimes(1);
    // createMuseumRouter received `enrichMuseumUseCase: undefined` both times.
    const calls = (createMuseumRouter as jest.Mock).mock.calls;
    for (const call of calls) {
      expect((call[0] as { enrichMuseumUseCase: unknown }).enrichMuseumUseCase).toBeUndefined();
    }
  });
});

// ─── buildHealthPayload — surviving prod-redaction mutants (L105/109/113) ──
describe('buildHealthPayload — prod-redaction branch coverage', () => {
  it('emits redis even when status is "skipped" (L105 truthiness check covers undefined-only)', () => {
    // L105 mutates `params.checks.redis !== undefined` to `true` (always
    // include) and to `false` (never include). The base health-check.test.ts
    // already covers the undefined-omission path; here we lock in that
    // "skipped" — a falsy-looking string that is still defined — is preserved
    // outside production.
    const payload = buildHealthPayload({
      checks: { database: 'up', redis: 'skipped' },
      llmConfigured: true,
      nodeEnv: 'development',
    });
    expect(payload.checks.redis).toBe('skipped');
  });

  it('emits llmCircuitBreaker even when state is "OPEN" (L109 defined-check)', () => {
    // Locks the defined-but-non-CLOSED branch so the mutant flipping
    // `!== undefined` to `true` / `false` is killed by the omit-undefined
    // assertion in the base test combined with this assertion.
    const payload = buildHealthPayload({
      checks: { database: 'up', llmCircuitBreaker: 'OPEN' },
      llmConfigured: true,
      nodeEnv: 'development',
    });
    expect(payload.checks.llmCircuitBreaker).toBe('OPEN');
  });

  it('includes commitSha in the payload when env.commitSha is defined (L113 NoCov block)', () => {
    // env.commitSha resolved at import time via the env mock = 'abc1234'.
    const payload = buildHealthPayload({
      checks: { database: 'up' },
      llmConfigured: true,
      nodeEnv: 'development',
    });
    expect(payload.commitSha).toBe('abc1234');
  });

  it('omits commitSha when env.commitSha is undefined (L113 false branch)', () => {
    const previous = envMock.commitSha;
    envMock.commitSha = undefined;
    try {
      const payload = buildHealthPayload({
        checks: { database: 'up' },
        llmConfigured: true,
        nodeEnv: 'development',
      });
      expect(payload.commitSha).toBeUndefined();
    } finally {
      envMock.commitSha = previous;
    }
  });
});
