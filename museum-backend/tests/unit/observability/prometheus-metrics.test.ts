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
    expect(body).toContain('chat_phase_duration_seconds_bucket{le="0.1",phase="llm",provider="openai"}');
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
});
