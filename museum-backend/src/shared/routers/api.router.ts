import { Router } from 'express';

import adminRouter from '@modules/admin/adapters/primary/http/admin.route';
import authRouter from '@modules/auth/adapters/primary/http/auth.route';
import { createChatRouter } from '@modules/chat/adapters/primary/http/chat.route';
import museumRouter from '@modules/museum/adapters/primary/http/museum.route';
import supportRouter from '@modules/support/adapters/primary/http/support.route';
import { env } from '@src/config/env';

import type { ChatService } from '@modules/chat/application/chat.service';
import type { FeatureFlagService } from '@shared/feature-flags/feature-flags.port';

/** Dependencies required to build the top-level API router. */
export interface ApiRouterDeps {
  chatService: ChatService;
  healthCheck: () => Promise<{ database: 'up' | 'down' }>;
  featureFlagService: FeatureFlagService;
}

/** Shape of the JSON response returned by the GET /api/health endpoint. */
export interface HealthPayload {
  status: 'ok' | 'degraded';
  checks: {
    database: 'up' | 'down';
    llmConfigured: boolean;
  };
  environment: string;
  version: string;
  timestamp: string;
  commitSha?: string;
  responseTimeMs?: number;
}

const resolveAppVersion = (): string => {
  const explicitVersion = process.env.APP_VERSION?.trim();
  if (explicitVersion) {
    return explicitVersion;
  }

  const packageVersion = process.env.npm_package_version?.trim();
  if (packageVersion) {
    return packageVersion;
  }

  return 'unknown';
};

const resolveCommitSha = (): string | undefined => {
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string fallback
  const source = process.env.COMMIT_SHA || process.env.GITHUB_SHA;
  const trimmed = source?.trim();
  return trimmed?.length ? trimmed : undefined;
};

/**
 * Builds a health-check response payload from the current system state.
 *
 * @param params - Database status and LLM configuration flag.
 * @param params.checks - Health check results.
 * @param params.checks.database - Database connectivity status.
 * @param params.llmConfigured - Whether at least one LLM provider is configured.
 * @returns Structured health payload with version and timestamp.
 */
export const buildHealthPayload = (params: {
  checks: { database: 'up' | 'down' };
  llmConfigured: boolean;
}): HealthPayload => {
  const ok = params.checks.database === 'up';
  const payload: HealthPayload = {
    status: ok ? 'ok' : 'degraded',
    checks: {
      database: params.checks.database,
      llmConfigured: params.llmConfigured,
    },
    environment: env.nodeEnv,
    version: resolveAppVersion(),
    timestamp: new Date().toISOString(),
  };

  const commitSha = resolveCommitSha();
  if (commitSha) {
    payload.commitSha = commitSha;
  }

  return payload;
};

/**
 * Creates the top-level Express router that mounts /health, /chat, and /auth sub-routers.
 *
 * @param root0 - Injected dependencies.
 * @param root0.chatService - Chat service instance for the chat sub-router.
 * @param root0.healthCheck - Async function returning database health status.
 * @param root0.featureFlagService - Feature flag service for route-level gating.
 * @returns Configured Express Router.
 */
export const createApiRouter = ({ chatService, healthCheck, featureFlagService }: ApiRouterDeps): Router => {
  // featureFlagService available for route-level gating (S3-10 OCR, S3-16 API Keys)
  void featureFlagService;
  const router = Router();

  router.get('/health', async (_req, res) => {
    res.set('Cache-Control', 'public, max-age=10, s-maxage=10');
    const start = Date.now();
    const checks = await healthCheck();
    const responseTimeMs = Date.now() - start;
    const llmConfigured =
      (env.llm.provider === 'openai' && !!env.llm.openAiApiKey) ||
      (env.llm.provider === 'deepseek' && !!env.llm.deepseekApiKey) ||
      (env.llm.provider === 'google' && !!env.llm.googleApiKey);

    const payload = buildHealthPayload({
      checks,
      llmConfigured,
    });
    payload.responseTimeMs = responseTimeMs;

    res.status(payload.status === 'ok' ? 200 : 503).json(payload);
  });

  router.use('/chat', createChatRouter(chatService));
  router.use('/auth', authRouter);
  router.use('/museums', museumRouter);
  router.use('/admin', adminRouter);
  router.use('/support', supportRouter);

  return router;
};
