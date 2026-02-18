import { Router } from 'express';

import { env } from '@src/config/env';
import { ChatService } from '@modules/chat/application/chat.service';
import { createChatRouter } from '@modules/chat/adapters/primary/http/chat.route';

export interface ApiRouterDeps {
  chatService: ChatService;
  healthCheck: () => Promise<{ database: 'up' | 'down' }>;
}

export const createApiRouter = ({ chatService, healthCheck }: ApiRouterDeps): Router => {
  const router = Router();

  router.get('/health', async (_req, res) => {
    const checks = await healthCheck();
    const llmConfigured =
      (env.llm.provider === 'openai' && !!env.llm.openAiApiKey) ||
      (env.llm.provider === 'deepseek' && !!env.llm.deepseekApiKey) ||
      (env.llm.provider === 'google' && !!env.llm.googleApiKey);

    const ok = checks.database === 'up';

    res.status(ok ? 200 : 503).json({
      status: ok ? 'ok' : 'degraded',
      checks: {
        database: checks.database,
        llmConfigured,
      },
      timestamp: new Date().toISOString(),
    });
  });

  router.use('/chat', createChatRouter(chatService));

  return router;
};
