import 'reflect-metadata';
import util from 'node:util';

import { logger } from '@shared/logger/logger';

import { AppDataSource } from './data-source';

const runMigrations = async (): Promise<void> => {
  try {
    await AppDataSource.initialize();
    const migrations = await AppDataSource.runMigrations();
    logger.info('database_migrations_applied', {
      appliedCount: migrations.length,
      names: migrations.map((migration) => migration.name),
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message || util.inspect(error) : util.inspect(error);
    logger.error('database_migrations_failed', { error: errorMessage });
    process.exitCode = 1;
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
};

void runMigrations();
