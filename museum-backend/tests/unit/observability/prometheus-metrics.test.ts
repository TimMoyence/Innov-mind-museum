import {
  httpRequestsTotal,
  httpRequestDurationSeconds,
  llmCacheHitsTotal,
  llmCacheMissesTotal,
  chatPhaseDurationSeconds,
  chatRequestDurationSeconds,
  chatPhaseErrorsTotal,
  renderMetrics,
  registry,
  enableDefaultMetrics,
} from '@shared/observability/prometheus-metrics';

describe('prometheus-metrics', () => {
  beforeEach(() => {
    registry.resetMetrics();
  });

  it('renderMetrics returns Prometheus text format', async () => {
    const body = await renderMetrics();
    expect(body).toContain('# HELP http_requests_total');
    expect(body).toContain('# TYPE http_requests_total counter');
  });

  it('http_requests_total increments per labels', async () => {
    httpRequestsTotal.inc({ route: '/foo', status: '200', method: 'GET' });
    const body = await renderMetrics();
    expect(body).toContain('http_requests_total{route="/foo",status="200",method="GET"} 1');
  });

  it('llm_cache_hits_total exposes context_class label', async () => {
    llmCacheHitsTotal.inc({ context_class: 'generic' });
    const body = await renderMetrics();
    expect(body).toContain('llm_cache_hits_total{context_class="generic"} 1');
  });

  it('llm_cache_misses_total exposes context_class label', async () => {
    llmCacheMissesTotal.inc({ context_class: 'museum-mode' });
    const body = await renderMetrics();
    expect(body).toContain('llm_cache_misses_total{context_class="museum-mode"} 1');
  });

  it('http_request_duration_seconds is a histogram', async () => {
    httpRequestDurationSeconds.observe({ route: '/foo', method: 'GET' }, 0.123);
    const body = await renderMetrics();
    expect(body).toContain('http_request_duration_seconds_bucket');
    expect(body).toContain('http_request_duration_seconds_sum');
  });

  it('chat_phase_duration_seconds exposes phase + provider labels', async () => {
    chatPhaseDurationSeconds.observe({ phase: 'llm', provider: 'openai' }, 1.234);
    const body = await renderMetrics();
    expect(body).toContain(
      'chat_phase_duration_seconds_bucket{le="0.1",phase="llm",provider="openai"}',
    );
    expect(body).toContain('chat_phase_duration_seconds_sum{phase="llm",provider="openai"}');
  });

  it('chat_request_duration_seconds carries the outcome label', async () => {
    chatRequestDurationSeconds.observe({ outcome: 'success' }, 2.5);
    chatRequestDurationSeconds.observe({ outcome: 'cache_hit' }, 0.05);
    const body = await renderMetrics();
    expect(body).toContain('chat_request_duration_seconds_sum{outcome="success"}');
    expect(body).toContain('chat_request_duration_seconds_sum{outcome="cache_hit"}');
  });

  it('chat_phase_errors_total carries phase + provider + error_type', async () => {
    chatPhaseErrorsTotal.inc({ phase: 'tts', provider: 'openai', error_type: 'timeout' });
    const body = await renderMetrics();
    expect(body).toContain(
      'chat_phase_errors_total{phase="tts",provider="openai",error_type="timeout"} 1',
    );
  });

  it('http_request_duration_seconds exposes the configured buckets', async () => {
    httpRequestDurationSeconds.observe({ route: '/foo', method: 'GET' }, 0.003);
    httpRequestDurationSeconds.observe({ route: '/foo', method: 'GET' }, 0.5);
    httpRequestDurationSeconds.observe({ route: '/foo', method: 'GET' }, 7);
    const body = await renderMetrics();
    const bucketBoundaries = ['0.005', '0.01', '0.05', '0.1', '0.25', '0.5', '1', '2.5', '5', '10'];
    for (const le of bucketBoundaries) {
      expect(body).toContain(
        `http_request_duration_seconds_bucket{le="${le}",route="/foo",method="GET"}`,
      );
    }
    expect(body).toContain(
      'http_request_duration_seconds_bucket{le="0.005",route="/foo",method="GET"} 1',
    );
    expect(body).toContain(
      'http_request_duration_seconds_bucket{le="0.5",route="/foo",method="GET"} 2',
    );
    expect(body).toContain(
      'http_request_duration_seconds_bucket{le="10",route="/foo",method="GET"} 3',
    );
    expect(body).toContain(
      'http_request_duration_seconds_bucket{le="+Inf",route="/foo",method="GET"} 3',
    );
  });

  it('renderMetrics resolves to a Prometheus text payload (await preserved)', async () => {
    const result = renderMetrics();
    expect(result).toBeInstanceOf(Promise);
    const body = await result;
    expect(typeof body).toBe('string');
    expect(body.startsWith('# HELP')).toBe(true);
  });

  it('enableDefaultMetrics() registers default Node.js process metrics on demand', async () => {
    // Default metrics are no longer registered at module load — that previously
    // started prom-client setIntervals that didn't .unref(), which kept Node
    // alive past Stryker mutant runs and broke hot-reload throughput.
    // App bootstrap (src/app.ts) calls this; tests must opt-in explicitly.
    enableDefaultMetrics();
    const body = await renderMetrics();
    expect(body).toContain('process_cpu_user_seconds_total');
    expect(body).toContain('nodejs_eventloop_lag_seconds');
  });

  it('enableDefaultMetrics() is idempotent (no double-registration)', () => {
    // Calling twice should not throw nor double-register collectors.
    enableDefaultMetrics();
    expect(() => enableDefaultMetrics()).not.toThrow();
  });
});
