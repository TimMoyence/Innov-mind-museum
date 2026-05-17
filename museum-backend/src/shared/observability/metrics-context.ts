import type { DataSource } from 'typeorm';

/**
 * Module-local DataSource handle. Lives here (not in `prometheus-metrics.ts`) to avoid cycle
 * prometheus-metrics → data-source → @modules/* → @shared/observability/*.
 * Wire in `src/index.ts` AFTER `AppDataSource.initialize()` resolves so gauge `collect()`
 * callbacks (e.g. `artwork_embeddings_count`) only see an initialised DataSource.
 */
let dataSource: DataSource | null = null;

export function setMetricsDataSource(ds: DataSource | null): void {
  dataSource = ds;
}

export function getDataSourceForMetrics(): DataSource | null {
  return dataSource;
}
