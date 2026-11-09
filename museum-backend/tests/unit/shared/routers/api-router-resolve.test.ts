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

const createMuseumRouterMock = jest.fn();
jest.mock('@modules/museum/adapters/primary/http/routes/museum.route', () => ({
  createMuseumRouter: (deps: unknown) => {
    createMuseumRouterMock(deps);
    const { Router } = jest.requireActual<typeof import('express')>('express');
    return Router();
  },
}));

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
jest.mock('@modules/auth/adapters/primary/http/routes/me.route', () => {
  const { Router } = jest.requireActual<typeof import('express')>('express');
  return { __esModule: true, default: Router() };
});
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
