import { DataSource } from 'typeorm';

import { logger } from '@shared/logger/logger';
import { env } from '@src/config/env';

import { AppDataSource } from './data-source';

/**
 * Read/write split router for TypeORM DataSources.
 *
 * `write` always points at the primary `AppDataSource`. `read` points at a
 * read-replica DataSource when `env.db.replicaUrl` is set; otherwise it
 * falls back to the primary (no behavior change — gradual migration path).
 *
 * Repository code that wants to read from replicas calls
 *   `dataSourceRouter.read.getRepository(X)`
 * instead of
 *   `AppDataSource.getRepository(X)`.
 *
 * Read-after-write paths (e.g. immediately reading the row just inserted)
 * stay on `dataSourceRouter.write` to avoid stale reads from replica lag.
 *
 * Spec: see git log (deleted 2026-05-03 — roadmap consolidation, original spec in commit history)
 * ADR: docs/adr/ADR-022-pg-read-replica-strategy.md
 */
class DataSourceRouter {
  private replicaDataSource?: DataSource;

  /** Always returns the primary (writer) DataSource. */
  get write(): DataSource {
    return AppDataSource;
  }

  /**
   * Returns the replica DataSource when DB_REPLICA_URL is set; otherwise
   * falls back to the primary. Lazy-initialised so test environments that
   * don't set the env var don't pay any startup cost.
   */
  get read(): DataSource {
    const replicaUrl = env.db.replicaUrl;
    if (!replicaUrl) {
      return AppDataSource;
    }
    if (!this.replicaDataSource) {
      this.replicaDataSource = new DataSource({
        ...AppDataSource.options,
        url: replicaUrl,
        // Replicas are read-only; never run migrations against them.
        migrationsRun: false,
        synchronize: false,
      } as ConstructorParameters<typeof DataSource>[0]);
      logger.info('replica_data_source_configured', { url: maskUrl(replicaUrl) });
    }
    return this.replicaDataSource;
  }

  /** Initialises the replica connection if configured. Called once at boot. */
  async initializeReplica(): Promise<void> {
    if (!env.db.replicaUrl) return;
    const ds = this.read;
    if (!ds.isInitialized) {
      await ds.initialize();
      logger.info('replica_data_source_initialized');
    }
  }

  /** Closes the replica connection if open. Called on graceful shutdown. */
  async destroy(): Promise<void> {
    if (this.replicaDataSource?.isInitialized) {
      await this.replicaDataSource.destroy();
    }
  }
}

const maskUrl = (url: string): string => {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = '***';
    return parsed.toString();
  } catch {
    return '<unparseable-url>';
  }
};

/** Singleton router. */
export const dataSourceRouter = new DataSourceRouter();
