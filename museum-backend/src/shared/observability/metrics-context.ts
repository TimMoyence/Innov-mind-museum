import type { DataSource } from 'typeorm';

/**
 * Module-local DataSource handle injected at app boot. Kept here (instead of
 * imported directly into `prometheus-metrics.ts`) to avoid a cycle:
 * `prometheus-metrics` → `data/db/data-source` → `@modules/*` →
 * `@shared/observability/*` would close the loop.
 *
 * Wire it in `src/index.ts` AFTER `AppDataSource.initialize()` resolves so
 * Prometheus collectors that depend on a live connection (e.g. the
 * `artwork_embeddings_count` gauge) only see an initialised DataSource.
 */
let dataSource: DataSource | null = null;

/** Registers the live DataSource used by `collect()` callbacks. Pass `null` to clear (tests). */
export function setMetricsDataSource(ds: DataSource | null): void {
  dataSource = ds;
}

/** Returns the registered DataSource, or `null` if none has been wired (e.g. before boot). */
export function getDataSourceForMetrics(): DataSource | null {
  return dataSource;
}
