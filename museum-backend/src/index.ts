import 'reflect-metadata';
import util from 'util';

import { env } from '@src/config/env';
import { AppDataSource } from '@src/data/db/data-source';
import { logger } from '@shared/logger/logger';
import { createApp } from './app';

const start = async (): Promise<void> => {
  try {
    await AppDataSource.initialize();
    logger.info('database_initialized', {
      host: env.db.host,
      database: env.db.database,
    });

    const app = createApp();
    const server = app.listen(env.port, () => {
      logger.info('server_started', {
        port: env.port,
        baseUrl: `http://localhost:${env.port}`,
      });
    });

    const shutdown = async (signal: string): Promise<void> => {
      logger.info('server_shutdown_start', { signal });
      server.close(async () => {
        try {
          if (AppDataSource.isInitialized) {
            await AppDataSource.destroy();
          }
        } finally {
          process.exit(0);
        }
      });

      setTimeout(() => process.exit(1), 10000).unref();
    };

    ['SIGINT', 'SIGTERM'].forEach((sig) => {
      process.on(sig as NodeJS.Signals, () => {
        void shutdown(sig);
      });
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message || util.inspect(error)
        : util.inspect(error);
    logger.error('startup_failed', {
      error: errorMessage,
      dbHost: env.db.host,
      dbPort: env.db.port,
    });
    if (env.nodeEnv !== 'production') {
      logger.warn('startup_db_hint', {
        message:
          'Database unreachable. For docker-compose use DB_HOST=localhost and DB_PORT=5433; for local Postgres usually DB_PORT=5432.',
      });
    }
    process.exit(1);
  }
};

void start();
