/**
 * WAVE 6 · C4 (RED) — per-user daily spend Histogram `llm_cost_user_daily_usd`.
 *
 * Discovery `cost.md` D4 (FAIBLE): no Prometheus metric exposes the Redis
 * per-user daily LLM spend, so ops cannot alert on "distribution of users near
 * their cap" without querying Redis directly. The design (wave6-design.md §1)
 * decides a LABELLESS Histogram in USD with bare subsystem prefix `llm_cost_`,
 * buckets [0.001,0.005,0.01,0.05,0.1,0.25,0.4,0.5,0.75,1,2.5,5], fed from
 * `LlmCostGuard.assertAllowed` AFTER a successful `increment()` by observing the
 * returned new daily total.
 *
 * RED contract (UFR-022): every assertion below FAILS at RED HEAD because
 * `llmCostUserDailyUsd` does not exist in prometheus-metrics.ts (verified: the
 * last export is `llmCostAnonBypassTotal`). The named import resolves to
 * `undefined`, so `.observe()` / `.get()` throw — feature-absent proof. The
 * GREEN phase declares the Histogram + the sentinel grandfathering; this file is
 * byte-frozen (wave6-red-test-manifest.json).
 *
 * Mirrors `prometheus-metrics-cost-gauge.test.ts` (registry dump + labelNames
 * introspection) and the anon-bypass `.get()).values` pattern in
 * `llm-cost-guard.test.ts:270`.
 */

import { llmCostUserDailyUsd, registry } from '@shared/observability/prometheus-metrics';

describe('llm_cost_user_daily_usd histogram (WAVE 6 · C4 red phase)', () => {
  beforeEach(() => {
    // Reset only this histogram — don't nuke unrelated metrics sharing the registry.
    llmCostUserDailyUsd.reset();
  });

  it('C4-R1 — registered in the registry as a Histogram with the exact name + _sum/_count/_bucket series', async () => {
    // A single observe materialises the series in the textual exposition.
    llmCostUserDailyUsd.observe(0.42);
    const dump = await registry.metrics();

    expect(dump).toMatch(/# HELP llm_cost_user_daily_usd /);
    expect(dump).toMatch(/# TYPE llm_cost_user_daily_usd histogram/);
    expect(dump).toMatch(/llm_cost_user_daily_usd_bucket\{le="[^"]+"\}/);
    expect(dump).toMatch(/llm_cost_user_daily_usd_sum /);
    expect(dump).toMatch(/llm_cost_user_daily_usd_count /);
  });

  it('C4-R1b — observe(0.42) lands in _sum and increments _count by one', async () => {
    llmCostUserDailyUsd.observe(0.42);
    const dump = await registry.metrics();

    // labelless histogram → bare `_sum` / `_count` lines (no label set).
    expect(dump).toMatch(/llm_cost_user_daily_usd_sum 0\.42\b/);
    expect(dump).toMatch(/llm_cost_user_daily_usd_count 1\b/);
  });

  it('C4-R2 — labelless (cardinality bounded; NEVER a userId label)', () => {
    // The contract is the metric's labelNames — reading it via the prom-client
    // public surface. An empty label set caps cardinality at ~15 fixed series.
    const labelNames = (llmCostUserDailyUsd as unknown as { labelNames: string[] }).labelNames;
    expect(labelNames).toEqual([]);
    expect(labelNames).not.toContain('userId');
    expect(labelNames).not.toContain('user_id');
  });

  it('C4-R3 — buckets encadrent le cap par-défaut: le="0.4" (80% seuil) ET le="0.5" (cap) présents', async () => {
    // Observe across the two thresholds so both cumulative buckets appear.
    llmCostUserDailyUsd.observe(0.42);
    const dump = await registry.metrics();

    expect(dump).toMatch(/llm_cost_user_daily_usd_bucket\{le="0\.4"\}/);
    expect(dump).toMatch(/llm_cost_user_daily_usd_bucket\{le="0\.5"\}/);
  });

  it('C4-R4 — HELP line is honest: mentions per-user daily spend in USD', async () => {
    const dump = await registry.metrics();
    // The help text must describe the metric as a per-user daily USD amount.
    expect(dump).toMatch(/# HELP llm_cost_user_daily_usd .*per-user daily.*/i);
    expect(dump).toMatch(/# HELP llm_cost_user_daily_usd .*USD.*/i);
  });
});
