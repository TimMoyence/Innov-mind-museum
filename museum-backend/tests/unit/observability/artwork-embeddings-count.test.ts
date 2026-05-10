import {
  artworkEmbeddingsCount,
  registry,
} from '@shared/observability/prometheus-metrics';
import {
  setMetricsDataSource,
  getDataSourceForMetrics,
} from '@shared/observability/metrics-context';
import { logger } from '@shared/logger/logger';

import type { DataSource } from 'typeorm';

const makeFakeDs = (
  queryImpl: jest.Mock<Promise<unknown>, [string]>,
): DataSource => ({ query: queryImpl } as unknown as DataSource);

describe('artwork_embeddings_count gauge (T9.2)', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    registry.resetMetrics();
    setMetricsDataSource(null);
    warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    setMetricsDataSource(null);
    warnSpy.mockRestore();
  });

  it('metrics-context starts unset (no DataSource leaking from prior tests)', () => {
    expect(getDataSourceForMetrics()).toBeNull();
  });

  it('collect() is a no-op when no DataSource is registered (preserves prior value, no warn)', async () => {
    // Seed a non-zero baseline, then "lose" the DataSource and confirm
    // the next collect() leaves the gauge alone (no reset to 0, no warn).
    const queryMock = jest.fn().mockResolvedValue([{ count: '500' }]);
    setMetricsDataSource(makeFakeDs(queryMock));
    const seeded = await artworkEmbeddingsCount.get();
    expect(seeded.values[0]?.value).toBe(500);

    setMetricsDataSource(null);
    const snapshot = await artworkEmbeddingsCount.get();

    expect(snapshot.values[0]?.value).toBe(500);
    expect(queryMock).toHaveBeenCalledTimes(1); // no extra query after DS cleared
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('collect() queries artwork_embeddings via the registered DataSource and updates the gauge', async () => {
    const queryMock = jest.fn().mockResolvedValue([{ count: '42' }]);
    setMetricsDataSource(makeFakeDs(queryMock));

    const snapshot = await artworkEmbeddingsCount.get();

    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringMatching(/select count\(\*\)/i),
    );
    expect(snapshot.values).toEqual([
      expect.objectContaining({ value: 42 }),
    ]);
  });

  it('collect() coerces the count to a number even if the driver returns a string', async () => {
    const queryMock = jest.fn().mockResolvedValue([{ count: '12345' }]);
    setMetricsDataSource(makeFakeDs(queryMock));

    const snapshot = await artworkEmbeddingsCount.get();

    expect(snapshot.values[0]?.value).toBe(12345);
    expect(typeof snapshot.values[0]?.value).toBe('number');
  });

  it('collect() defaults to 0 when the query returns no rows', async () => {
    const queryMock = jest.fn().mockResolvedValue([]);
    setMetricsDataSource(makeFakeDs(queryMock));

    const snapshot = await artworkEmbeddingsCount.get();

    expect(snapshot.values[0]?.value).toBe(0);
  });

  it('collect() fails open: keeps the last value and logs a warn when the query rejects', async () => {
    const queryMock = jest
      .fn<Promise<unknown>, [string]>()
      .mockResolvedValueOnce([{ count: '42' }])
      .mockRejectedValueOnce(new Error('connection terminated unexpectedly'));
    setMetricsDataSource(makeFakeDs(queryMock));

    // First collect: succeeds, gauge = 42.
    const first = await artworkEmbeddingsCount.get();
    expect(first.values[0]?.value).toBe(42);

    // Second collect: throws, gauge keeps 42, warn logged.
    const second = await artworkEmbeddingsCount.get();
    expect(second.values[0]?.value).toBe(42);
    expect(warnSpy).toHaveBeenCalledWith(
      'artwork_embeddings_count_collect_failed',
      expect.objectContaining({ error: 'connection terminated unexpectedly' }),
    );
  });

  it('exposes the gauge in the Prometheus text format with TYPE + HELP banners', async () => {
    const queryMock = jest.fn().mockResolvedValue([{ count: '9001' }]);
    setMetricsDataSource(makeFakeDs(queryMock));

    const body = await registry.metrics();

    expect(body).toContain('# HELP artwork_embeddings_count');
    expect(body).toContain('# TYPE artwork_embeddings_count gauge');
    expect(body).toContain('artwork_embeddings_count 9001');
  });
});
