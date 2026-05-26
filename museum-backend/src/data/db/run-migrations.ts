import 'reflect-metadata';
import util from 'node:util';

import { logger } from '@shared/logger/logger';

import { AppDataSource } from './data-source';
import { assertPgVectorAvailable } from './pgvector-preflight';

const runMigrations = async (): Promise<void> => {
  try {
    await AppDataSource.initialize();
    // I-OPS6 — fail fast with an actionable message if the connected Postgres
    // server cannot provide pgvector >= 0.7.0 (the FP16 `halfvec` type used by
    // artwork_embeddings). Runs AFTER initialize() (needs a live connection)
    // and BEFORE runMigrations() so the AddArtworkEmbeddings `halfvec` DDL
    // never fails opaquely on a too-old / wrong-image server.
    await assertPgVectorAvailable(AppDataSource);
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
