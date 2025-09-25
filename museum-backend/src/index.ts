import 'reflect-metadata';
import dotenv from 'dotenv';
import type { RequestHandler } from 'express';
dotenv.config();

import compression from 'compression';
import pgSession from 'connect-pg-simple';
import cors from 'cors';
import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import morgan from 'morgan';
import passport from 'passport';
import { Pool } from 'pg';

import router from '@shared/routers/index.router';
import { AppDataSource } from './data/db/data-source';
import { setupSwagger } from './helpers/swagger';
import { configurePassport } from './modules/auth/adapters/secondary/passport.config';

const app = express();
const port = Number(process.env.PORT || 3000);
const isProd = process.env.NODE_ENV === 'production';

// IMPORTANT derrière Nginx pour que req.secure soit vrai et que les cookies "secure" soient posés
app.set('trust proxy', (process.env.TRUST_PROXY || 'true') === 'true' ? 1 : 0);

// Sécurité & perf
app.use(helmet({ contentSecurityPolicy: false })); // active CSP plus tard quand tu auras la liste blanche
app.use(compression());
app.use(morgan(isProd ? 'combined' : 'dev'));

// CORS via env (liste séparée par des virgules). Si vide => autorise tout (dev).
const origins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: origins.length ? origins : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);

const healthHandler: RequestHandler = (_req, res) => {
  res.status(200).send('ok');
};
app.get('/health', healthHandler);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Session (store Postgres en prod si activé)
let store: session.Store | undefined;
if (isProd && (process.env.SESS_USE_PG || 'true') === 'true') {
  const PgSession = pgSession(session);
  const pool = new Pool({
    host: process.env.DB_HOST || 'db',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.PGDATABASE,
    ssl: false,
  });
  store = new PgSession({ pool, tableName: 'user_sessions' });
}

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'change_me',
    resave: false,
    saveUninitialized: false,
    store,
    cookie: {
      httpOnly: true,
      secure: isProd, // nécessite app.set('trust proxy', 1)
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      domain: process.env.COOKIE_DOMAIN || undefined, // ex: "asilidesign.fr"
    },
  }) as unknown as express.RequestHandler,
);

configurePassport(passport);
app.use(passport.initialize());
app.use(passport.session());

// Swagger seulement hors prod
if (!isProd) {
  setupSwagger(app);
}

app.use('/api/v1', router);

// Démarrage après la DB
AppDataSource.initialize()
  .then(() => {
    const server = app.listen(port, () => {
      console.log(`[server]: http://localhost:${port}/api/v1/`);
    });

    const shutdown = async (sig: string) => {
      console.log(`[server]: ${sig} received, shutting down...`);
      server.close(async () => {
        try {
          await AppDataSource.destroy();
        } catch {}
        process.exit(0);
      });
      // hard-exit si ça traîne
      setTimeout(() => process.exit(1), 10000).unref();
    };
    ['SIGINT', 'SIGTERM'].forEach((s) =>
      process.on(s as NodeJS.Signals, () => shutdown(s)),
    );
  })
  .catch((error: unknown) => {
    console.error('Erreur de connexion à la DB:', error);
    process.exit(1);
  });
