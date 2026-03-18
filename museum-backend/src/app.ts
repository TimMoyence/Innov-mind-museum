import compression from 'compression';
import cors from 'cors';
import express, { Express } from 'express';
import helmet from 'helmet';

import { buildChatService } from '@modules/chat';
import { createApiRouter } from '@shared/routers/api.router';
import { env } from '@src/config/env';
import { AppDataSource } from '@src/data/db/data-source';
import { errorHandler } from '@src/helpers/middleware/error.middleware';
import {
  byIp,
  createRateLimitMiddleware,
} from '@src/helpers/middleware/rate-limit.middleware';
import { requestIdMiddleware } from '@src/helpers/middleware/request-id.middleware';
import { requestLoggerMiddleware } from '@src/helpers/middleware/request-logger.middleware';
import { setupSwagger } from '@src/helpers/swagger';

/** Optional overrides for dependency injection, primarily used in tests. */
interface CreateAppOptions {
  chatService?: ReturnType<typeof buildChatService>;
  healthCheck?: () => Promise<{ database: 'up' | 'down' }>;
}

const isProd = env.nodeEnv === 'production';

const createHealthCheck = async (): Promise<{ database: 'up' | 'down' }> => {
  if (!AppDataSource.isInitialized) {
    return { database: 'down' };
  }

  try {
    await AppDataSource.query('SELECT 1');
    return { database: 'up' };
  } catch {
    return { database: 'down' };
  }
};

/**
 * Creates and configures the Express application with all middleware, routers, and error handling.
 * @param options - Optional dependency overrides for testing.
 * @returns Fully configured Express application.
 */
export const createApp = (options: CreateAppOptions = {}): Express => {
  const app = express();

  app.set('trust proxy', env.trustProxy ? 1 : 0);

  app.use(requestIdMiddleware);
  app.use(requestLoggerMiddleware);

  const corsOrigins: cors.CorsOptions['origin'] =
    env.corsOrigins.length > 0 ? env.corsOrigins : isProd ? false : true;

  app.use(
    cors({
      origin: corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    }),
  );

  app.use(
    createRateLimitMiddleware({
      limit: env.rateLimit.ipLimit,
      windowMs: env.rateLimit.windowMs,
      keyGenerator: byIp,
    }),
  );

  app.use(
    helmet({
      contentSecurityPolicy: isProd ? undefined : false,
    }),
  );
  app.use(compression());

  app.use((_req, res, next) => {
    res.setTimeout(env.requestTimeoutMs);
    next();
  });

  app.use(express.json({ limit: env.jsonBodyLimit }));
  app.use(express.urlencoded({ extended: true, limit: env.jsonBodyLimit }));

  if (!isProd) {
    setupSwagger(app);
  }

  const chatService = options.chatService || buildChatService(AppDataSource);
  const healthCheck = options.healthCheck || createHealthCheck;

  app.use('/api', createApiRouter({ chatService, healthCheck }));

  app.use(errorHandler);

  return app;
};
