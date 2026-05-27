/**
 * Verifies the `EXTRACTION_WORKER_ENABLED=false` short-circuit in
 * `resolveEnrichMuseumUseCase()` (private to `src/shared/routers/api.router.ts`).
 *
 * The function is exercised indirectly via `createApiRouter`, which calls
 * `mountDomainRouters` → `resolveEnrichMuseumUseCase()`. With the flag off,
 * the function must:
 *  - never instantiate `BullmqMuseumEnrichmentQueueAdapter` (no ioredis socket)
 *  - never call `buildEnrichMuseumUseCase`
 *  - return `undefined`, which `createMuseumRouter` receives as
 *    `enrichMuseumUseCase: undefined`.
 *
 * Mirrors the e2e harness path (flag pinned to false) to keep coverage parity.
 */

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('@src/config/env', () => ({
  env: {
    extractionWorkerEnabled: false,
    nodeEnv: 'test',
    appVersion: '0.0.0-test',
    commitSha: undefined,
    llm: {
      provider: 'openai',
      openAiApiKey: undefined,
      deepseekApiKey: undefined,
      googleApiKey: undefined,
    },
    redis: { host: 'localhost', port: 6379, password: undefined },
  },
}));

const bullmqAdapterCtor = jest.fn();
jest.mock(
  '@modules/museum/adapters/secondary/enrichment/bullmq-museum-enrichment-queue.adapter',
  () => ({
    BullmqMuseumEnrichmentQueueAdapter: jest.fn().mockImplementation((...args: unknown[]) => {
      bullmqAdapterCtor(...args);
      return {};
    }),
  }),
);

const buildEnrichMuseumUseCaseMock = jest.fn();
const buildLowDataPackServiceMock = jest.fn(() => ({}));
jest.mock('@modules/museum', () => ({
  buildEnrichMuseumUseCase: (...args: unknown[]) => {
    buildEnrichMuseumUseCaseMock(...(args as []));
    return {};
  },
  buildLowDataPackService: (...args: unknown[]) => buildLowDataPackServiceMock(...(args as [])),
}));

// Stub the museum router so we can capture the deps passed by mountDomainRouters.
const createMuseumRouterMock = jest.fn();
jest.mock('@modules/museum/adapters/primary/http/routes/museum.route', () => ({
  createMuseumRouter: (deps: unknown) => {
    createMuseumRouterMock(deps);
    const { Router } = jest.requireActual<typeof import('express')>('express');
    return Router();
  },
}));

// Stub remaining sub-routers to keep the test hermetic — none of them
// participate in the assertions, but their import-time side effects (rate
// limiters, etc.) would otherwise pollute the test environment.
jest.mock('@modules/admin/adapters/primary/http/routes/admin-ke.route', () => ({
  createAdminKeRouter: () => {
    const { Router } = jest.requireActual<typeof import('express')>('express');
    return Router();
  },
}));
jest.mock('@modules/admin/adapters/primary/http/routes/admin.route', () => {
  const { Router } = jest.requireActual<typeof import('express')>('express');
  return { __esModule: true, default: Router() };
});
jest.mock('@modules/admin/adapters/primary/http/routes/cache-purge.route', () => ({
  createCachePurgeRouter: () => {
    const { Router } = jest.requireActual<typeof import('express')>('express');
    return Router();
  },
}));
jest.mock('@modules/auth/adapters/primary/http/routes/auth.route', () => {
  const { Router } = jest.requireActual<typeof import('express')>('express');
  return { __esModule: true, default: Router() };
});
jest.mock('@modules/auth/adapters/primary/http/routes/consent.route', () => {
  const { Router } = jest.requireActual<typeof import('express')>('express');
  return { __esModule: true, default: Router() };
});
// `me.route` pulls in `@shared/audit` → `data-source.ts` at module load,
// which evaluates `env.db.host`. The mocked env on this suite intentionally
// omits the `db` block (this test cares only about extraction-worker wiring),
// so we stub the router out the same way as the other auth routes.
jest.mock('@modules/auth/adapters/primary/http/routes/me.route', () => {
  const { Router } = jest.requireActual<typeof import('express')>('express');
  return { __esModule: true, default: Router() };
});
// Same rationale as `me.route`: `mfa.route` pulls in the auth use-case
// composition root (which constructs PG repositories), so it would crash on
// the env-mocked test setup unless stubbed.
jest.mock('@modules/auth/adapters/primary/http/routes/mfa.route', () => {
  const { Router } = jest.requireActual<typeof import('express')>('express');
  return { __esModule: true, default: Router() };
});
// `admin-export.route` imports `authenticated.middleware` which transitively
// pulls `auth/useCase` → `AppDataSource`. Same env.db.host trap as me.route /
// mfa.route — stub the router out (R2 corrective loop 1, 2026-05-15).
jest.mock('@modules/admin/adapters/primary/http/routes/admin-export.route', () => {
  const { Router } = jest.requireActual<typeof import('express')>('express');
  return { __esModule: true, default: Router() };
});
jest.mock('@modules/chat/adapters/primary/http/routes/chat.route', () => ({
  createChatRouter: () => {
    const { Router } = jest.requireActual<typeof import('express')>('express');
    return Router();
  },
}));
jest.mock('@modules/chat/chat-module', () => ({
  getArtKeywordRepository: () => undefined,
  getArtworkKnowledgeRepo: () => undefined,
  getCompareImageUseCase: () => undefined,
  getCompareSessionAccessVerifier: () => undefined,
  getDescribeService: () => undefined,
  getLlmCircuitBreakerState: () => undefined,
  getLlmGuardCircuitBreakerState: () => undefined,
  getMessageExplanationUseCase: () => undefined,
  // W3 (T5.3): chat-session context update use-case accessor. This suite only
  // exercises the EXTRACTION_WORKER_ENABLED=false short-circuit; the PATCH
  // /sessions/:id/context route is not exercised so undefined is sufficient.
  getUpdateSessionContextUseCase: () => undefined,
  getUserMemoryService: () => undefined,
}));
jest.mock('@modules/daily-art', () => ({
  createDailyArtRouter: () => {
    const { Router } = jest.requireActual<typeof import('express')>('express');
    return Router();
  },
}));
jest.mock('@modules/museum/adapters/primary/http/routes/low-data-pack.route', () => ({
  createLowDataPackRouter: () => {
    const { Router } = jest.requireActual<typeof import('express')>('express');
    return Router();
  },
}));
jest.mock('@modules/review/adapters/primary/http/routes/review.route', () => {
  const { Router } = jest.requireActual<typeof import('express')>('express');
  return { __esModule: true, default: Router() };
});
jest.mock('@modules/support/adapters/primary/http/routes/support.route', () => {
  const { Router } = jest.requireActual<typeof import('express')>('express');
  return { __esModule: true, default: Router() };
});
// Same `env.db.host` trap as me.route / mfa.route: since the leads
// persist-then-notify work, `leads.route` pulls `leads/useCase` → a PG
// `LeadRepositoryPg(AppDataSource)` at module load, so it crashes on the
// db-less env mock unless stubbed.
jest.mock('@modules/leads/adapters/primary/http/routes/leads.route', () => {
  const { Router } = jest.requireActual<typeof import('express')>('express');
  return { __esModule: true, default: Router() };
});

import { createApiRouter } from '@shared/routers/api.router';
import { BullmqMuseumEnrichmentQueueAdapter } from '@modules/museum/adapters/secondary/enrichment/bullmq-museum-enrichment-queue.adapter';

import type { ChatService } from '@modules/chat/useCase/orchestration/chat.service';

describe('resolveEnrichMuseumUseCase — EXTRACTION_WORKER_ENABLED=false', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('skips BullmqMuseumEnrichmentQueueAdapter construction', () => {
    const chatService = {} as ChatService;
    const healthCheck = jest.fn().mockResolvedValue({ database: 'up' as const });

    createApiRouter({ chatService, healthCheck });

    expect(BullmqMuseumEnrichmentQueueAdapter).not.toHaveBeenCalled();
    expect(bullmqAdapterCtor).not.toHaveBeenCalled();
  });

  it('does not call buildEnrichMuseumUseCase', () => {
    const chatService = {} as ChatService;
    const healthCheck = jest.fn().mockResolvedValue({ database: 'up' as const });

    createApiRouter({ chatService, healthCheck });

    expect(buildEnrichMuseumUseCaseMock).not.toHaveBeenCalled();
  });

  it('passes enrichMuseumUseCase: undefined to createMuseumRouter', () => {
    const chatService = {} as ChatService;
    const healthCheck = jest.fn().mockResolvedValue({ database: 'up' as const });

    createApiRouter({ chatService, healthCheck });

    expect(createMuseumRouterMock).toHaveBeenCalledTimes(1);
    const deps = createMuseumRouterMock.mock.calls[0]?.[0] as {
      enrichMuseumUseCase: unknown;
    };
    expect(deps.enrichMuseumUseCase).toBeUndefined();
  });
});
