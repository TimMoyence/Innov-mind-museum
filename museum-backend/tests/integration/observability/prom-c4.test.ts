/**
 * C4 Phase 7 T7.3 — Prometheus counters integration test.
 *
 * Verifies the four C4 counters declared in
 * `museum-backend/src/shared/observability/prometheus-metrics.ts` are present
 * on `/metrics` and increment with the expected label cardinality:
 *
 *   - `chat_sources_emitted_total{type}`
 *   - `chat_sources_rejected_total{reason}`
 *   - `chat_websearch_fallback_total{outcome}`
 *   - `chat_url_head_probe_total{cache_hit,outcome}`
 *
 * Plan : `docs/plans/2026-05-10-c4-launch-prompt.md` §K Step 7.3.
 * Spec : `team-state/2026-05-11-c4-anti-hallucination/spec.md#R12`.
 * Design : §10 Observability.
 *
 * Why integration tier : these counters are wired across multiple use-cases
 * (sources-validator, url-head-probe, knowledge-router, message-commit). The
 * unit tests for each use-case mock prom-client out, so we verify the
 * end-to-end registry surface here. Test exercises the public `renderMetrics()`
 * surface — same code-path Express `/metrics` route uses.
 */

import {
  chatSourcesEmittedTotal,
  chatSourcesRejectedTotal,
  chatWebsearchFallbackTotal,
  chatUrlHeadProbeTotal,
  renderMetrics,
  registry,
} from '@shared/observability/prometheus-metrics';

describe('C4 prometheus counters — registry surface (T7.3)', () => {
  beforeEach(() => {
    registry.resetMetrics();
  });

  it('chat_sources_emitted_total exposes {type} label and shows up in /metrics', async () => {
    chatSourcesEmittedTotal.inc({ type: 'wikidata' });
    chatSourcesEmittedTotal.inc({ type: 'web' });
    const body = await renderMetrics();
    expect(body).toContain('# HELP chat_sources_emitted_total');
    expect(body).toContain('# TYPE chat_sources_emitted_total counter');
    expect(body).toContain('chat_sources_emitted_total{type="wikidata"} 1');
    expect(body).toContain('chat_sources_emitted_total{type="web"} 1');
  });

  it('chat_sources_rejected_total exposes {reason} label with both taxonomy values', async () => {
    chatSourcesRejectedTotal.inc({ reason: 'quote-not-found' });
    chatSourcesRejectedTotal.inc({ reason: 'quote-too-short' });
    const body = await renderMetrics();
    expect(body).toContain('# HELP chat_sources_rejected_total');
    expect(body).toContain('# TYPE chat_sources_rejected_total counter');
    expect(body).toContain('chat_sources_rejected_total{reason="quote-not-found"} 1');
    expect(body).toContain('chat_sources_rejected_total{reason="quote-too-short"} 1');
  });

  it('chat_websearch_fallback_total exposes {outcome} label for hit/empty/error', async () => {
    chatWebsearchFallbackTotal.inc({ outcome: 'hit' });
    chatWebsearchFallbackTotal.inc({ outcome: 'empty' });
    chatWebsearchFallbackTotal.inc({ outcome: 'error' });
    const body = await renderMetrics();
    expect(body).toContain('# HELP chat_websearch_fallback_total');
    expect(body).toContain('# TYPE chat_websearch_fallback_total counter');
    expect(body).toContain('chat_websearch_fallback_total{outcome="hit"} 1');
    expect(body).toContain('chat_websearch_fallback_total{outcome="empty"} 1');
    expect(body).toContain('chat_websearch_fallback_total{outcome="error"} 1');
  });

  it('chat_url_head_probe_total exposes {cache_hit, outcome} labels', async () => {
    chatUrlHeadProbeTotal.inc({ cache_hit: 'true', outcome: 'reachable' });
    chatUrlHeadProbeTotal.inc({ cache_hit: 'false', outcome: 'reachable' });
    chatUrlHeadProbeTotal.inc({ cache_hit: 'false', outcome: 'unreachable' });
    const body = await renderMetrics();
    expect(body).toContain('# HELP chat_url_head_probe_total');
    expect(body).toContain('# TYPE chat_url_head_probe_total counter');
    expect(body).toContain(
      'chat_url_head_probe_total{cache_hit="true",outcome="reachable"} 1',
    );
    expect(body).toContain(
      'chat_url_head_probe_total{cache_hit="false",outcome="reachable"} 1',
    );
    expect(body).toContain(
      'chat_url_head_probe_total{cache_hit="false",outcome="unreachable"} 1',
    );
  });

  it('all four C4 counters are declared even with no increments (0-baseline)', async () => {
    // Touching `.inc({ ... }, 0)` registers the labelled series so /metrics
    // emits the HELP+TYPE preamble even on a cold registry. This mirrors what
    // the Grafana scraper sees on a fresh boot before the first chat request.
    chatSourcesEmittedTotal.inc({ type: 'wikidata' }, 0);
    chatSourcesRejectedTotal.inc({ reason: 'quote-not-found' }, 0);
    chatWebsearchFallbackTotal.inc({ outcome: 'hit' }, 0);
    chatUrlHeadProbeTotal.inc({ cache_hit: 'true', outcome: 'reachable' }, 0);

    const body = await renderMetrics();
    expect(body).toContain('chat_sources_emitted_total');
    expect(body).toContain('chat_sources_rejected_total');
    expect(body).toContain('chat_websearch_fallback_total');
    expect(body).toContain('chat_url_head_probe_total');
  });
});
