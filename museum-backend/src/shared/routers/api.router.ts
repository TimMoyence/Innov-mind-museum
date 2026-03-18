import { Router } from 'express';

import { env } from '@src/config/env';
import { ChatService } from '@modules/chat/application/chat.service';
import { createChatRouter } from '@modules/chat/adapters/primary/http/chat.route';
import authRouter from '@modules/auth/adapters/primary/http/auth.route';

/** Dependencies required to build the top-level API router. */
export interface ApiRouterDeps {
  chatService: ChatService;
  healthCheck: () => Promise<{ database: 'up' | 'down' }>;
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
  const source = process.env.COMMIT_SHA || process.env.GITHUB_SHA;
  const trimmed = source?.trim();
  return trimmed?.length ? trimmed : undefined;
};

/**
 * Builds a health-check response payload from the current system state.
 * @param params - Database status and LLM configuration flag.
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
 * @param deps - Injected chatService and healthCheck function.
 * @returns Configured Express Router.
 */
export const createApiRouter = ({ chatService, healthCheck }: ApiRouterDeps): Router => {
  const router = Router();

  router.get('/health', async (_req, res) => {
    const checks = await healthCheck();
    const llmConfigured =
      (env.llm.provider === 'openai' && !!env.llm.openAiApiKey) ||
      (env.llm.provider === 'deepseek' && !!env.llm.deepseekApiKey) ||
      (env.llm.provider === 'google' && !!env.llm.googleApiKey);

    const payload = buildHealthPayload({
      checks,
      llmConfigured,
    });

    res.status(payload.status === 'ok' ? 200 : 503).json(payload);
  });

  router.use('/chat', createChatRouter(chatService));
  router.use('/auth', authRouter);

  return router;
};
