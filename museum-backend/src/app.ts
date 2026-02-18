import compression from 'compression';
import pgSession from 'connect-pg-simple';
import cors from 'cors';
import express, { Express } from 'express';
import session from 'express-session';
import helmet from 'helmet';
import passport from 'passport';
import { Pool } from 'pg';

import { configurePassport } from '@modules/auth/adapters/secondary/passport.config';
import { buildChatService } from '@modules/chat';
import { createApiRouter } from '@shared/routers/api.router';
import legacyRouter from '@shared/routers/index.router';
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

export const createApp = (options: CreateAppOptions = {}): Express => {
  const app = express();

  app.set('trust proxy', env.trustProxy ? 1 : 0);

  app.use(requestIdMiddleware);
  app.use(requestLoggerMiddleware);

  const corsOrigins: cors.CorsOptions['origin'] =
    env.corsOrigins.length > 0 ? env.corsOrigins : true;

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
      contentSecurityPolicy: false,
    }),
  );
  app.use(compression());

  app.use((_req, res, next) => {
    res.setTimeout(env.requestTimeoutMs);
    next();
  });

  app.use(express.json({ limit: env.jsonBodyLimit }));
  app.use(express.urlencoded({ extended: true, limit: env.jsonBodyLimit }));

  let store: session.Store | undefined;
  if (isProd && (process.env.SESS_USE_PG || 'true') === 'true') {
    const PgSession = pgSession(session);
    const pool = new Pool({
      host: env.db.host,
      port: env.db.port,
      user: env.db.user,
      password: env.db.password,
      database: env.db.database,
      max: env.db.poolMax,
      ssl: false,
    });
    store = new PgSession({ pool, tableName: 'user_sessions' });
  }

  app.use(
    session({
      secret: env.auth.sessionSecret,
      resave: false,
      saveUninitialized: false,
      store,
      cookie: {
        httpOnly: true,
        secure: isProd,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        domain: env.cookieDomain,
      },
    }) as unknown as express.RequestHandler,
  );

  configurePassport(passport);
  app.use(passport.initialize());
  app.use(passport.session());

  if (!isProd) {
    setupSwagger(app);
  }

  const chatService = options.chatService || buildChatService(AppDataSource);
  const healthCheck = options.healthCheck || createHealthCheck;

  app.use('/api', createApiRouter({ chatService, healthCheck }));
  app.use('/api/v1', legacyRouter);

  app.use(errorHandler);

  return app;
};
